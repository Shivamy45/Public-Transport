"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import Link from "next/link";

const BusesRoutesPage = () => {
	const [buses, setBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedRoute, setSelectedRoute] = useState(null);

	// Load all buses
	useEffect(() => {
		const loadBuses = async () => {
			try {
				setLoading(true);
				const busesRef = collection(db, "buses");
				const q = query(busesRef, orderBy("createdAt", "desc"));
				const snapshot = await getDocs(q);

				const busesData = [];
				snapshot.forEach((doc) => {
					const data = doc.data();
					busesData.push({
						id: doc.id,
						...data,
						stops: data.stops || [],
					});
				});

				setBuses(busesData);
			} catch (err) {
				console.error("Error loading buses:", err);
				setError("Failed to load bus routes");
			} finally {
				setLoading(false);
			}
		};

		loadBuses();
	}, []);

	// Filter buses based on search
	const filteredBuses = buses.filter((bus) => {
		const searchLower = searchTerm.toLowerCase();
		return (
			bus.busNo?.toLowerCase().includes(searchLower) ||
			bus.busName?.toLowerCase().includes(searchLower) ||
			bus.stops.some((stop) =>
				stop.stopName?.toLowerCase().includes(searchLower)
			)
		);
	});

	const formatTime = (timeStr) => {
		if (!timeStr) return "N/A";
		const [hours, minutes] = timeStr.split(":");
		const hour = parseInt(hours);
		const ampm = hour >= 12 ? "PM" : "AM";
		const displayHour = hour % 12 || 12;
		return `${displayHour}:${minutes} ${ampm}`;
	};

	const getRouteDescription = (stops) => {
		if (!stops || stops.length === 0) return "No stops defined";
		if (stops.length === 1) return stops[0].stopName;
		return `${stops[0].stopName} → ${stops[stops.length - 1].stopName}`;
	};

	if (loading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center min-h-[400px]">
					<div className="text-center">
						<div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
						<p className="text-gray-600">Loading bus routes...</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			{/* Header */}
			<div className="mb-8">
				<h1 className="text-4xl font-bold text-gray-900 mb-2">
					Bus Routes
				</h1>
				<p className="text-gray-600">
					Find and explore all available bus routes
				</p>
			</div>

			{/* Search Bar */}
			<div className="mb-6">
				<div className="relative max-w-lg">
					<input
						type="text"
						placeholder="Search by bus number, name, or stop..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
					/>
					<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						<svg
							className="h-5 w-5 text-gray-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
				</div>
			</div>

			{/* Error Message */}
			{error && (
				<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
					{error}
				</div>
			)}

			{/* No Results */}
			{!loading && filteredBuses.length === 0 && (
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
					<h3 className="mt-2 text-sm font-medium text-gray-900">
						No bus routes found
					</h3>
					<p className="mt-1 text-sm text-gray-500">
						{searchTerm
							? "Try a different search term"
							: "No bus routes have been added yet"}
					</p>
				</div>
			)}

			{/* Bus Routes Grid */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{filteredBuses.map((bus) => (
					<div
						key={bus.id}
						className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden cursor-pointer"
						onClick={() => setSelectedRoute(bus)}>
						<div className="p-6">
							{/* Bus Header */}
							<div className="flex items-start justify-between mb-4">
								<div>
									<h3 className="text-xl font-bold text-blue-600">
										{bus.busNo}
									</h3>
									<p className="text-gray-700 font-medium">
										{bus.busName}
									</p>
								</div>
								<div className="text-right text-sm text-gray-500">
									<div>{formatTime(bus.startTime)}</div>
									<div>to {formatTime(bus.endTime)}</div>
								</div>
							</div>

							{/* Route Description */}
							<div className="mb-4">
								<p className="text-sm font-medium text-gray-600 mb-1">
									Route:
								</p>
								<p className="text-gray-800">
									{getRouteDescription(bus.stops)}
								</p>
							</div>

							{/* Bus Details */}
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="font-medium text-gray-600">
										Capacity:
									</span>
									<span className="ml-1 text-gray-800">
										{bus.capacity} seats
									</span>
								</div>
								<div>
									<span className="font-medium text-gray-600">
										Stops:
									</span>
									<span className="ml-1 text-gray-800">
										{bus.stops.length}
									</span>
								</div>
							</div>

							{/* Return Journey Badge */}
							{bus.returnJourney?.enabled && (
								<div className="mt-3">
									<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
										Return Journey Available
									</span>
								</div>
							)}

							{/* Driver Info */}
							<div className="mt-4 pt-4 border-t border-gray-200">
								<p className="text-xs text-gray-500">
									Driver:{" "}
									<span className="text-gray-700">
										{bus.driverName}
									</span>
								</p>
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Route Detail Modal */}
			{selectedRoute && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
					<div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
						<div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
							<div>
								<h2 className="text-2xl font-bold text-gray-900">
									{selectedRoute.busNo} -{" "}
									{selectedRoute.busName}
								</h2>
								<p className="text-gray-600">Route Details</p>
							</div>
							<button
								onClick={() => setSelectedRoute(null)}
								className="text-gray-400 hover:text-gray-600">
								<svg
									className="h-6 w-6"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<div className="p-6">
							{/* Bus Info */}
							<div className="grid grid-cols-2 gap-6 mb-6">
								<div>
									<h3 className="font-semibold text-gray-900 mb-3">
										Bus Information
									</h3>
									<div className="space-y-2 text-sm">
										<div>
											<span className="font-medium">
												Driver:
											</span>{" "}
											{selectedRoute.driverName}
										</div>
										<div>
											<span className="font-medium">
												Capacity:
											</span>{" "}
											{selectedRoute.capacity} passengers
										</div>
										<div>
											<span className="font-medium">
												Start Time:
											</span>{" "}
											{formatTime(
												selectedRoute.startTime
											)}
										</div>
										<div>
											<span className="font-medium">
												End Time:
											</span>{" "}
											{formatTime(selectedRoute.endTime)}
										</div>
									</div>
								</div>

								<div>
									<h3 className="font-semibold text-gray-900 mb-3">
										Journey Details
									</h3>
									<div className="space-y-2 text-sm">
										<div>
											<span className="font-medium">
												Total Stops:
											</span>{" "}
											{selectedRoute.stops.length}
										</div>
										<div>
											<span className="font-medium">
												Return Journey:
											</span>{" "}
											{selectedRoute.returnJourney
												?.enabled
												? "Available"
												: "Not Available"}
										</div>
										{selectedRoute.returnJourney?.enabled &&
											selectedRoute.returnJourney
												?.startTime && (
												<div>
													<span className="font-medium">
														Return Start:
													</span>{" "}
													{formatTime(
														selectedRoute
															.returnJourney
															.startTime
													)}
												</div>
											)}
									</div>
								</div>
							</div>

							{/* Route Stops */}
							<div>
								<h3 className="font-semibold text-gray-900 mb-3">
									Route Stops
								</h3>
								<div className="space-y-3">
									{selectedRoute.stops.map((stop, index) => (
										<div
											key={stop.stopId || index}
											className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
											<div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
												{stop.stopNo || index + 1}
											</div>
											<div className="flex-1">
												<div className="font-medium text-gray-900">
													{stop.stopName}
												</div>
												<div className="text-sm text-gray-500">
													Scheduled:{" "}
													{formatTime(stop.stopTime)}
													{stop.lat && stop.lng && (
														<span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
															GPS Located
														</span>
													)}
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default BusesRoutesPage;
