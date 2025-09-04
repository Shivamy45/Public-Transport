"use client";
import React, { useEffect, useState } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import BusInfo from "../components/BusInfo";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import MapView from "../components/MapView";
import AddBus from "../components/AddBus";

const AdminPage = () => {
	const [busIds, setBusIds] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showAddModal, setShowAddModal] = useState(false);

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

	useEffect(() => {
		const loadAdminBuses = async () => {
			try {
				setLoading(true);
				setError("");
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;
				if (!saved) {
					setError("Not authenticated.");
					setLoading(false);
					return;
				}
				const currentUser = JSON.parse(saved);
				if (currentUser?.role !== "admin") {
					setError("Only admins can access this page.");
					setLoading(false);
					return;
				}

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
				setError("Failed to load buses.");
			} finally {
				setLoading(false);
			}
		};

		loadAdminBuses();
	}, []);

	// Refresh bus list when modal closes (to show newly added buses)
	const handleCloseModal = () => {
		setShowAddModal(false);
		// Reload buses to show any newly added ones
		const currentUser = JSON.parse(
			localStorage.getItem("currentUser") || "{}"
		);
		if (currentUser?.email) {
			// Trigger a reload of the bus list
			window.location.reload();
		}
	};

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

				{/* Add Bus Button */}
				<div className="mb-8">
					<div
						className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
						onClick={() => setShowAddModal(true)}
						role="button"
						aria-label="Add new bus">
						<div className="text-center">
							<FaPlus
								size={48}
								className="text-gray-400 hover:text-blue-500 mx-auto mb-4"
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
								className="mx-auto h-12 w-12 text-gray-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 014 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6H4a7.963 7.963 0 0117 0h1.5A1.5 1.5 0 0124 7.5v3a1.5 1.5 0 01-1.5 1.5H21a7.963 7.963 0 01-2 5.291z"
								/>
							</svg>
							<h3 className="mt-2 text-lg font-medium text-gray-900">
								No buses added yet
							</h3>
							<p className="mt-1 text-gray-500">
								Get started by adding your first bus route
							</p>
						</div>
					) : (
						busIds.map((busId) => (
							<BusInfo key={busId} busId={busId} />
						))
					)}
				</div>

				{/* Overview Map */}
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

				{/* Add Bus Modal */}
				{showAddModal && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 overflow-y-auto">
						<div
							className="w-full max-w-4xl rounded-xl bg-white text-black p-8 relative mx-4 max-h-[90vh] overflow-y-auto focus:outline-none shadow-2xl"
							role="dialog"
							aria-modal="true"
							aria-labelledby="add-bus-title">
							{/* Modal Header */}
							<div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
								<div>
									<h2
										id="add-bus-title"
										className="text-3xl font-bold text-gray-900">
										Add New Bus
									</h2>
									<p className="text-gray-600 mt-1">
										Create a new bus route with stops
									</p>
								</div>
								<button
									onClick={handleCloseModal}
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
