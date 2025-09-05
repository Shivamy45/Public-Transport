"use client";
import React, { useEffect, useState } from "react";
import { FaSearch, FaMapMarkerAlt, FaClock, FaUsers } from "react-icons/fa";
import UserBusInfo from "../components/UserBusInfo";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

const UserPage = () => {
	const router = useRouter();
	const [allBuses, setAllBuses] = useState([]);
	const [filteredBuses, setFilteredBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [searchTerm, setSearchTerm] = useState("");
	const [currentUser, setCurrentUser] = useState(null);
	const [selectedRoute, setSelectedRoute] = useState("");
	const [availableRoutes, setAvailableRoutes] = useState([]);

	// Check authentication and load user data
	useEffect(() => {
		const checkAuth = () => {
			try {
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;

				if (!saved) {
					setError("Please log in to access the bus information.");
					setLoading(false);
					router.push("/login");
					return;
				}

				const user = JSON.parse(saved);
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

	// Load all buses for users to view
	useEffect(() => {
		if (!currentUser) return;

		const loadAllBuses = async () => {
			try {
				setLoading(true);
				setError("");

				// Get all buses from the collection
				const busesRef = collection(db, "buses");
				const snapshot = await getDocs(busesRef);
				
				const buses = [];
				const routes = new Set();

				snapshot.forEach((doc) => {
					const busData = { id: doc.id, ...doc.data() };
					buses.push(busData);
					
					// Extract route information for filtering
					if (busData.busName) {
						routes.add(busData.busName);
					}
				});

				setAllBuses(buses);
				setFilteredBuses(buses);
				setAvailableRoutes(Array.from(routes).sort());
			} catch (err) {
				console.error("Error loading buses:", err);
				setError("Failed to load bus information. Please try refreshing the page.");
			} finally {
				setLoading(false);
			}
		};

		loadAllBuses();
	}, [currentUser]);

	// Filter buses based on search term and selected route
	useEffect(() => {
		let filtered = allBuses;

		// Filter by search term
		if (searchTerm.trim()) {
			filtered = filtered.filter(
				(bus) =>
					bus.busName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					bus.busNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					bus.driverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					bus.stops?.some((stop) =>
						stop.stopName?.toLowerCase().includes(searchTerm.toLowerCase())
					)
			);
		}

		// Filter by selected route
		if (selectedRoute) {
			filtered = filtered.filter((bus) => bus.busName === selectedRoute);
		}

		setFilteredBuses(filtered);
	}, [searchTerm, selectedRoute, allBuses]);

	// Show loading state while checking authentication
	if (loading && !currentUser) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
					<p className="text-gray-600">Loading bus information...</p>
				</div>
			</div>
		);
	}

	// Calculate stats for dashboard
	const activeBuses = filteredBuses.filter(bus => {
		const status = bus.status?.current?.toLowerCase();
		return status && status !== "not started" && status !== "completed";
	}).length;

	const totalStops = filteredBuses.reduce((sum, bus) => {
		return sum + (Array.isArray(bus.stops) ? bus.stops.length : 0);
	}, 0);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="text-center mb-8">
					<h1 className="text-5xl font-bold text-gray-900 mb-2">
						Bus Tracker
					</h1>
					<p className="text-gray-600">
						Track live bus locations and schedules
					</p>
					{currentUser && (
						<p className="text-sm text-blue-600 mt-2">
							Welcome, {currentUser.name || currentUser.email}
						</p>
					)}
				</div>

				{/* Quick Stats */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
					<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
						<div className="text-3xl font-bold text-blue-600 mb-2">
							{filteredBuses.length}
						</div>
						<div className="text-gray-600 flex items-center justify-center">
							<FaMapMarkerAlt className="mr-2" />
							Total Routes
						</div>
					</div>
					<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
						<div className="text-3xl font-bold text-green-600 mb-2">
							{activeBuses}
						</div>
						<div className="text-gray-600 flex items-center justify-center">
							<FaClock className="mr-2" />
							Active Now
						</div>
					</div>
					<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
						<div className="text-3xl font-bold text-purple-600 mb-2">
							{totalStops}
						</div>
						<div className="text-gray-600 flex items-center justify-center">
							<FaUsers className="mr-2" />
							Total Stops
						</div>
					</div>
				</div>

				{/* Search and Filter Section */}
				<div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
					<div className="flex flex-col md:flex-row gap-4">
						{/* Search Input */}
						<div className="flex-1 relative">
							<FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								placeholder="Search by bus name, number, driver, or stop..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>
						
						{/* Route Filter */}
						<div className="md:w-64">
							<select
								value={selectedRoute}
								onChange={(e) => setSelectedRoute(e.target.value)}
								className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
								<option value="">All Routes</option>
								{availableRoutes.map((route) => (
									<option key={route} value={route}>
										{route}
									</option>
								))}
							</select>
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
								<p className="text-gray-600">Loading buses...</p>
							</div>
						</div>
					) : filteredBuses.length === 0 ? (
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
									d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 014 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6H4a7.963 7.963 0 0117 0h1.5A1.5 1.5 0 0124 7.5v3a1.5 1.5 0 01-1.5 1.5H21a7.963 7.963 0 01-2 5.291z"
								/>
							</svg>
							<h3 className="text-xl font-medium text-gray-900 mb-2">
								{searchTerm || selectedRoute
									? "No buses found"
									: "No buses available"}
							</h3>
							<p className="text-gray-500 mb-6">
								{searchTerm || selectedRoute
									? "Try adjusting your search or filter criteria."
									: "There are currently no buses to display."}
							</p>
							{(searchTerm || selectedRoute) && (
								<button
									onClick={() => {
										setSearchTerm("");
										setSelectedRoute("");
									}}
									className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
									Clear Filters
								</button>
							)}
						</div>
					) : (
						filteredBuses.map((bus) => (
							<UserBusInfo key={bus.id} busId={bus.id} />
						))
					)}
				</div>

				{/* Results Summary */}
				{filteredBuses.length > 0 && (searchTerm || selectedRoute) && (
					<div className="mt-8 text-center">
						<p className="text-gray-600">
							Showing {filteredBuses.length} of {allBuses.length} buses
						</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default UserPage;