"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import mapboxgl from "mapbox-gl";

const StopsPage = () => {
	const [stops, setStops] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedStop, setSelectedStop] = useState(null);

	// Map
	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);

	// Load all unique stops from buses
	useEffect(() => {
		const loadStops = async () => {
			try {
				setLoading(true);
				const busesRef = collection(db, "buses");
				const snapshot = await getDocs(busesRef);

				const stopMap = new Map();

				snapshot.forEach((doc) => {
					const busData = doc.data();
					const busStops = busData.stops || [];

					busStops.forEach((stop) => {
						const stopKey = stop.stopName?.toLowerCase() || "";
						if (!stopMap.has(stopKey) && stop.stopName) {
							stopMap.set(stopKey, {
								id:
									stop.stopId ||
									`stop_${Date.now()}_${Math.random()}`,
								name: stop.stopName,
								lat: stop.lat || null,
								lng: stop.lng || null,
								buses: [],
								schedules: [],
							});
						}

						// Add bus info to this stop
						const stopData = stopMap.get(stopKey);
						if (
							stopData &&
							!stopData.buses.find(
								(b) => b.busNo === busData.busNo
							)
						) {
							stopData.buses.push({
								busId: doc.id,
								busNo: busData.busNo,
								busName: busData.busName,
								driverName: busData.driverName,
							});
							stopData.schedules.push({
								busNo: busData.busNo,
								time: stop.stopTime,
								stopNo: stop.stopNo || 0,
							});
						}
					});
				});

				const stopsArray = Array.from(stopMap.values()).sort((a, b) =>
					a.name.localeCompare(b.name)
				);

				setStops(stopsArray);
			} catch (err) {
				console.error("Error loading stops:", err);
				setError("Failed to load bus stops");
			} finally {
				setLoading(false);
			}
		};

		loadStops();
	}, []);

	// Initialize map
	useEffect(() => {
		if (!mapContainer.current || loading || stops.length === 0) return;

		// Clean up existing map
		if (mapRef.current) {
			mapRef.current.remove();
		}

		// Clean up existing markers
		markersRef.current.forEach((marker) => marker.remove());
		markersRef.current = [];

		// Set mapbox token
		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

		if (!mapboxgl.accessToken) {
			console.warn("Mapbox token not configured");
			return;
		}

		// Filter stops with valid coordinates
		const validStops = stops.filter((stop) => stop.lat && stop.lng);

		if (validStops.length === 0) {
			// Default to India center if no GPS coordinates
			mapRef.current = new mapboxgl.Map({
				container: mapContainer.current,
				style: "mapbox://styles/mapbox/streets-v11",
				center: [77.209, 28.6139], // Delhi
				zoom: 10,
			});
			return;
		}

		// Calculate center point
		const avgLat =
			validStops.reduce((sum, stop) => sum + stop.lat, 0) /
			validStops.length;
		const avgLng =
			validStops.reduce((sum, stop) => sum + stop.lng, 0) /
			validStops.length;

		// Initialize map
		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center: [avgLng, avgLat],
			zoom: 11,
		});

		mapRef.current.on("load", () => {
			// Add markers for each stop
			validStops.forEach((stop) => {
				const marker = new mapboxgl.Marker({
					color: selectedStop?.id === stop.id ? "#FF4136" : "#0074D9",
				})
					.setLngLat([stop.lng, stop.lat])
					.setPopup(
						new mapboxgl.Popup().setHTML(`
                            <div class="p-2">
                                <h3 class="font-bold text-sm">${stop.name}</h3>
                                <p class="text-xs text-gray-600">${
									stop.buses.length
								} bus(es)</p>
                                <div class="mt-1">
                                    ${stop.buses
										.slice(0, 3)
										.map(
											(bus) =>
												`<span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1 mb-1">${bus.busNo}</span>`
										)
										.join("")}
                                    ${
										stop.buses.length > 3
											? `<span class="text-xs text-gray-500">+${
													stop.buses.length - 3
											  } more</span>`
											: ""
									}
                                </div>
                            </div>
                        `)
					)
					.addTo(mapRef.current);

				marker.getElement().addEventListener("click", () => {
					setSelectedStop(stop);
				});

				markersRef.current.push(marker);
			});

			// Fit map to show all stops
			if (validStops.length > 1) {
				const bounds = new mapboxgl.LngLatBounds();
				validStops.forEach((stop) =>
					bounds.extend([stop.lng, stop.lat])
				);
				mapRef.current.fitBounds(bounds, { padding: 50 });
			}
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [stops, loading, selectedStop]);

	// Filter stops based on search
	const filteredStops = stops.filter((stop) => {
		const searchLower = searchTerm.toLowerCase();
		return (
			stop.name.toLowerCase().includes(searchLower) ||
			stop.buses.some(
				(bus) =>
					bus.busNo.toLowerCase().includes(searchLower) ||
					bus.busName.toLowerCase().includes(searchLower)
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

	if (loading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center min-h-[400px]">
					<div className="text-center">
						<div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
						<p className="text-gray-600">Loading bus stops...</p>
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
					Bus Stops
				</h1>
				<p className="text-gray-600">
					Find bus stops and their schedules
				</p>
			</div>

			{/* Search Bar */}
			<div className="mb-6">
				<div className="relative max-w-lg">
					<input
						type="text"
						placeholder="Search by stop name or bus number..."
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

			<div className="grid lg:grid-cols-3 gap-8">
				{/* Stops List */}
				<div className="lg:col-span-1">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						All Stops ({filteredStops.length})
					</h2>

					{error && (
						<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
							{error}
						</div>
					)}

					{filteredStops.length === 0 ? (
						<div className="text-center py-8">
							<svg
								className="mx-auto h-12 w-12 text-gray-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<h3 className="mt-2 text-sm font-medium text-gray-900">
								No stops found
							</h3>
							<p className="mt-1 text-sm text-gray-500">
								{searchTerm
									? "Try a different search term"
									: "No bus stops available"}
							</p>
						</div>
					) : (
						<div className="space-y-3 max-h-[600px] overflow-y-auto">
							{filteredStops.map((stop) => (
								<div
									key={stop.id}
									className={`p-4 border rounded-lg cursor-pointer transition-colors ${
										selectedStop?.id === stop.id
											? "border-blue-500 bg-blue-50"
											: "border-gray-200 hover:border-gray-300 bg-white"
									}`}
									onClick={() => setSelectedStop(stop)}>
									<div className="flex justify-between items-start mb-2">
										<h3 className="font-medium text-gray-900">
											{stop.name}
										</h3>
										{stop.lat && stop.lng && (
											<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
												GPS
											</span>
										)}
									</div>
									<div className="text-sm text-gray-600 mb-2">
										{stop.buses.length} bus route
										{stop.buses.length !== 1 ? "s" : ""}
									</div>
									<div className="flex flex-wrap gap-1">
										{stop.buses
											.slice(0, 4)
											.map((bus, idx) => (
												<span
													key={idx}
													className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
													{bus.busNo}
												</span>
											))}
										{stop.buses.length > 4 && (
											<span className="inline-block text-xs text-gray-500 px-2 py-1">
												+{stop.buses.length - 4} more
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Map and Details */}
				<div className="lg:col-span-2 space-y-6">
					{/* Map */}
					<div className="bg-white rounded-lg shadow-sm border">
						<div className="p-4 border-b border-gray-200">
							<h2 className="text-xl font-semibold text-gray-900">
								Stop Locations
							</h2>
							<p className="text-sm text-gray-600">
								{stops.filter((s) => s.lat && s.lng).length} of{" "}
								{stops.length} stops have GPS coordinates
							</p>
						</div>
						<div
							ref={mapContainer}
							className="w-full"
							style={{ height: "400px" }}
						/>
					</div>

					{/* Selected Stop Details */}
					{selectedStop && (
						<div className="bg-white rounded-lg shadow-sm border">
							<div className="p-4 border-b border-gray-200">
								<div className="flex justify-between items-start">
									<div>
										<h2 className="text-xl font-semibold text-gray-900">
											{selectedStop.name}
										</h2>
										<p className="text-sm text-gray-600">
											Stop Details & Schedule
										</p>
									</div>
									<button
										onClick={() => setSelectedStop(null)}
										className="text-gray-400 hover:text-gray-600">
										<svg
											className="h-5 w-5"
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
							</div>

							<div className="p-4">
								<div className="grid md:grid-cols-2 gap-6">
									{/* Location Info */}
									<div>
										<h3 className="font-semibold text-gray-900 mb-3">
											Location Information
										</h3>
										<div className="space-y-2 text-sm">
											<div>
												<span className="font-medium text-gray-600">
													Coordinates:
												</span>
												{selectedStop.lat &&
												selectedStop.lng ? (
													<span className="ml-2 text-gray-800">
														{selectedStop.lat.toFixed(
															6
														)}
														,{" "}
														{selectedStop.lng.toFixed(
															6
														)}
													</span>
												) : (
													<span className="ml-2 text-gray-500">
														Not available
													</span>
												)}
											</div>
											<div>
												<span className="font-medium text-gray-600">
													Total Bus Routes:
												</span>
												<span className="ml-2 text-gray-800">
													{selectedStop.buses.length}
												</span>
											</div>
										</div>
									</div>

									{/* Bus Routes */}
									<div>
										<h3 className="font-semibold text-gray-900 mb-3">
											Bus Routes
										</h3>
										<div className="space-y-2">
											{selectedStop.buses.map(
												(bus, idx) => (
													<div
														key={idx}
														className="flex items-center justify-between p-2 bg-gray-50 rounded">
														<div>
															<span className="font-medium text-blue-600">
																{bus.busNo}
															</span>
															<span className="ml-2 text-sm text-gray-600">
																{bus.busName}
															</span>
														</div>
													</div>
												)
											)}
										</div>
									</div>
								</div>

								{/* Schedule */}
								{selectedStop.schedules &&
									selectedStop.schedules.length > 0 && (
										<div className="mt-6">
											<h3 className="font-semibold text-gray-900 mb-3">
												Schedule
											</h3>
											<div className="bg-gray-50 rounded-lg overflow-hidden">
												<table className="w-full text-sm">
													<thead className="bg-gray-100">
														<tr>
															<th className="px-4 py-2 text-left font-medium text-gray-700">
																Bus
															</th>
															<th className="px-4 py-2 text-left font-medium text-gray-700">
																Stop #
															</th>
															<th className="px-4 py-2 text-left font-medium text-gray-700">
																Scheduled Time
															</th>
														</tr>
													</thead>
													<tbody>
														{selectedStop.schedules
															.sort((a, b) =>
																(
																	a.time || ""
																).localeCompare(
																	b.time || ""
																)
															)
															.map(
																(
																	schedule,
																	idx
																) => (
																	<tr
																		key={
																			idx
																		}
																		className="border-t border-gray-200">
																		<td className="px-4 py-2 font-medium text-blue-600">
																			{
																				schedule.busNo
																			}
																		</td>
																		<td className="px-4 py-2 text-gray-800">
																			#
																			{
																				schedule.stopNo
																			}
																		</td>
																		<td className="px-4 py-2 text-gray-800">
																			{formatTime(
																				schedule.time
																			)}
																		</td>
																	</tr>
																)
															)}
													</tbody>
												</table>
											</div>
										</div>
									)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default StopsPage;
