"use client";
import React, { useEffect, useState } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import BusInfo from "../components/BusInfo";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
// import MapView from "../components/MapView"; // TODO: Re-enable when Fleet View is re-implemented
import AddBus from "../components/AddBus";
import { useRouter } from "next/navigation";

const AdminPage = () => {
	const router = useRouter();
	const [busIds, setBusIds] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showAddModal, setShowAddModal] = useState(false);
	const [currentUser, setCurrentUser] = useState(null);
	const [runningCount, setRunningCount] = useState(0);
	const [totalStops, setTotalStops] = useState(0);

	// Check authentication and load user data
	useEffect(() => {
		const checkAuth = () => {
			try {
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;

				if (!saved) {
					setError("Please log in to access the admin dashboard.");
					setLoading(false);
					router.push("/login");
					return;
				}

				const user = JSON.parse(saved);
				if (user?.role !== "admin") {
					setError("Only administrators can access this page.");
					setLoading(false);
					router.push("/");
					return;
				}

				setCurrentUser(user);
				setError("");
			} catch (err) {
				console.error("Error checking authentication:", err);
				setError("Authentication error. Please log in again.");
				setLoading(false);
				router.push("/login");
			}
		};

		checkAuth();

		// Listen for auth state changes
		const handleAuthChange = () => {
			checkAuth();
		};

		window.addEventListener("authStateChanged", handleAuthChange);
		return () =>
			window.removeEventListener("authStateChanged", handleAuthChange);
	}, [router]);

	// Load admin buses
	useEffect(() => {
		if (!currentUser) return;

		const loadAdminBuses = async () => {
			try {
				setLoading(true);
				setError("");

				const usersRef = collection(db, "users");
				const q = query(
					usersRef,
					where("email", "==", currentUser.email)
				);
				const snap = await getDocs(q);

				if (snap.empty) {
					setBusIds([]);
					setLoading(false);
					return;
				}

				const adminDoc = snap.docs[0].data();
				setBusIds(Array.isArray(adminDoc?.buses) ? adminDoc.buses : []);
			} catch (err) {
				console.error("Error loading buses:", err);
				setError(
					"Failed to load buses. Please try refreshing the page."
				);
			} finally {
				setLoading(false);
			}
		};

		loadAdminBuses();
	}, [currentUser]);

	// Compute runningCount and totalStops when busIds change
	useEffect(() => {
		const fetchBusStats = async () => {
			if (!busIds || busIds.length === 0) {
				setRunningCount(0);
				setTotalStops(0);
				return;
			}
			try {
				const docs = await Promise.all(
					busIds.map(async (id) => {
						try {
							const ref = doc(db, "buses", id);
							const snap = await getDoc(ref);
							return snap.exists() ? snap.data() : null;
						} catch (_) {
							return null;
						}
					})
				);
				const buses = docs.filter(Boolean);
				const running = buses.filter((b) => {
					const current = b?.status?.current;
					return current && current.toLowerCase() !== "not started";
				}).length;
				const stopsCount = buses.reduce(
					(sum, b) => sum + (Array.isArray(b?.stops) ? b.stops.length : 0),
					0
				);
				setRunningCount(running);
				setTotalStops(stopsCount);
			} catch (err) {
				console.error("Error computing bus stats:", err);
			}
		};
		fetchBusStats();
	}, [busIds]);

	// Modal management
	useEffect(() => {
		const originalOverflow = document.body.style.overflow;
		const onKeyDown = (e) => {
			if (e.key === "Escape") setShowAddModal(false);
		};

		if (showAddModal) {
			document.body.style.overflow = "hidden";
			document.addEventListener("keydown", onKeyDown);
		} else {
			document.body.style.overflow = originalOverflow || "";
		}

		return () => {
			document.body.style.overflow = originalOverflow || "";
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [showAddModal]);

	// Refresh bus list when modal closes successfully
	const handleCloseModal = async () => {
		setShowAddModal(false);

		// Reload buses to show any newly added ones
		if (currentUser?.email) {
			try {
				const usersRef = collection(db, "users");
				const q = query(
					usersRef,
					where("email", "==", currentUser.email)
				);
				const snap = await getDocs(q);

				if (!snap.empty) {
					const adminDoc = snap.docs[0].data();
					setBusIds(
						Array.isArray(adminDoc?.buses) ? adminDoc.buses : []
					);
				}
			} catch (err) {
				console.error("Error refreshing bus list:", err);
			}
		}
	};

	// Show loading state while checking authentication
	if (loading && !currentUser) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
					<p className="text-gray-600">Loading admin dashboard...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="text-center mb-8">
					<h1 className="text-5xl font-bold text-gray-900 mb-2">
						Admin Dashboard
					</h1>
					<p className="text-gray-600">
						Manage your bus fleet and routes
					</p>
				</div>

				{/* Quick Stats */}
				{busIds.length > 0 && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
						<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
							<div className="text-3xl font-bold text-blue-600 mb-2">
								{busIds.length}
							</div>
							<div className="text-gray-600">Total Buses</div>
						</div>
						<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
							<div className="text-3xl font-bold text-green-600 mb-2">
								{runningCount}
							</div>
							<div className="text-gray-600">Running Currently</div>
						</div>
						<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
							<div className="text-3xl font-bold text-purple-600 mb-2">
								{totalStops}
							</div>
							<div className="text-gray-600">Total Stops</div>
						</div>
					</div>
				)}

				{/* Add Bus Button */}
				<div className="mb-8">
					<div
						className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all duration-200"
						onClick={() => setShowAddModal(true)}
						role="button"
						aria-label="Add new bus">
						<div className="text-center">
							<FaPlus
								size={48}
								className="text-gray-400 hover:text-blue-500 mx-auto mb-4 transition-colors"
							/>
							<p className="text-lg font-medium text-gray-600">
								Add New Bus
							</p>
							<p className="text-sm text-gray-500">
								Click to create a new bus route
							</p>
						</div>
					</div>
				</div>

				{/* Error Message */}
				{error && (
					<div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
						<div className="flex items-center">
							<svg
								className="h-5 w-5 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							{error}
						</div>
					</div>
				)}

				{/* Bus List */}
				<div className="space-y-6">
					{loading ? (
						<div className="flex items-center justify-center py-12">
							<div className="text-center">
								<div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
								<p className="text-gray-600">
									Loading your buses...
								</p>
							</div>
						</div>
					) : busIds.length === 0 ? (
						<div className="text-center py-12">
							<svg
								className="mx-auto h-16 w-16 text-gray-400 mb-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 014 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6H4a7.963 7.963 0 0117 0h1.5A1.5 1.5 0 0124 7.5v3a1.5 1.5 0 01-1.5 1.5H21a7.963 7.963 0 01-2 5.291z"
								/>
							</svg>
							<h3 className="text-xl font-medium text-gray-900 mb-2">
								No buses added yet
							</h3>
							<p className="text-gray-500 mb-6">
								Get started by adding your first bus route to
								begin managing your fleet
							</p>
							<button
								onClick={() => setShowAddModal(true)}
								className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
								Add Your First Bus
							</button>
						</div>
					) : (
						busIds.map((busId) => (
							<BusInfo key={busId} busId={busId} />
						))
					)}
				</div>

				{/* TODO: Fleet Overview Map - Re-implement when bus location tracking is ready
				{busIds.length > 0 && (
					<div className="mt-12">
						<div className="mb-6">
							<h2 className="text-2xl font-bold text-gray-900">
								Fleet Overview
							</h2>
							<p className="text-gray-600">
								All bus routes on the map
							</p>
						</div>
						<MapView />
					</div>
				)}
				*/}

				{/* Add Bus Modal */}
				{showAddModal && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 overflow-y-auto">
						<div
							className="w-full max-w-6xl rounded-xl bg-white text-black p-8 relative mx-4 max-h-[95vh] overflow-y-auto focus:outline-none shadow-2xl"
							role="dialog"
							aria-modal="true"
							aria-labelledby="add-bus-title">
							{/* Modal Header */}
							<div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 sticky top-0 bg-white z-10">
								<div>
									<h2
										id="add-bus-title"
										className="text-3xl font-bold text-gray-900">
										Add New Bus
										</h2>
										<p className="text-gray-600 mt-1">
											Create a new bus route with stops and
											schedule
										</p>
								</div>
								<button
									onClick={() => setShowAddModal(false)}
									className="p-2 hover:bg-gray-100 rounded-full transition-colors"
									aria-label="Close add bus form">
									<FaTimes
										size={24}
										className="text-gray-600"
									/>
								</button>
							</div>

							{/* Modal Content */}
							<AddBus onSuccess={handleCloseModal} />
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default AdminPage;
