"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import mapboxgl from "mapbox-gl";
import { formatDistanceKm } from "@/lib/format";

// Haversine formula to calculate distance
function haversineDistance(lat1, lon1, lat2, lon2) {
	function toRad(x) {
		return (x * Math.PI) / 180;
	}
	const R = 6371; // Earth radius in kilometers
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

const NearbyBusesPage = () => {
	const [userLocation, setUserLocation] = useState(null);
	const [buses, setBuses] = useState([]);
	const [nearbyBuses, setNearbyBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [locationError, setLocationError] = useState("");
	const [searchRadius, setSearchRadius] = useState(5); // km
	const [gettingLocation, setGettingLocation] = useState(false);

	// Map
	const mapContainer = useRef(null);
	const mapRef = useRef(null);

	// Get user's current location
	const getCurrentLocation = () => {
		setGettingLocation(true);
		setLocationError("");

		if (!navigator.geolocation) {
			setLocationError("Geolocation is not supported by this browser");
			setGettingLocation(false);
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const location = {
					lat: position.coords.latitude,
					lng: position.coords.longitude,
					accuracy: position.coords.accuracy,
				};
				setUserLocation(location);
				setGettingLocation(false);
			},
			(error) => {
				let errorMessage = "Unable to get your location";
				switch (error.code) {
					case error.PERMISSION_DENIED:
						errorMessage =
							"Location access denied. Please enable location permissions.";
						break;
					case error.POSITION_UNAVAILABLE:
						errorMessage = "Location information unavailable.";
						break;
					case error.TIMEOUT:
						errorMessage = "Location request timed out.";
						break;
				}
				setLocationError(errorMessage);
				setGettingLocation(false);
			},
			{
				enableHighAccuracy: true,
				timeout: 15000,
				maximumAge: 300000, // 5 minutes
			}
		);
	};

	// Load all buses
	useEffect(() => {
		const loadBuses = async () => {
			try {
				const busesRef = collection(db, "buses");
				const snapshot = await getDocs(busesRef);

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
				setError("Failed to load bus data");
			} finally {
				setLoading(false);
			}
		};

		loadBuses();
	}, []);

	// Calculate nearby buses when user location or radius changes
	useEffect(() => {
		if (!userLocation || buses.length === 0) {
			setNearbyBuses([]);
			return;
		}

		const nearby = [];

		buses.forEach((bus) => {
			// Check each stop of the bus
			const nearbyStops = bus.stops
				.filter((stop) => stop.lat && stop.lng)
				.map((stop) => {
					const distance = haversineDistance(
						userLocation.lat,
						userLocation.lng,
						stop.lat,
						stop.lng
					);
					return { ...stop, distance };
				})
				.filter((stop) => stop.distance <= searchRadius)
				.sort((a, b) => a.distance - b.distance);

			if (nearbyStops.length > 0) {
				nearby.push({
					...bus,
					nearbyStops,
					minDistance: nearbyStops[0].distance,
				});
			}
		});

		// Sort by closest distance
		nearby.sort((a, b) => a.minDistance - b.minDistance);
		setNearbyBuses(nearby);
	}, [userLocation, buses, searchRadius]);

	// Initialize map
	useEffect(() => {
		if (!mapContainer.current || !userLocation) return;

		// Clean up existing map
		if (mapRef.current) {
			mapRef.current.remove();
		}

		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

		if (!mapboxgl.accessToken) {
			console.warn("Mapbox token not configured");
			return;
		}

		// Initialize map centered on user location
		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center: [userLocation.lng, userLocation.lat],
			zoom: 13,
		});

		mapRef.current.on("load", () => {
			// Add user location marker
			new mapboxgl.Marker({ color: "#FF6B6B", scale: 1.2 })
				.setLngLat([userLocation.lng, userLocation.lat])
				.setPopup(
					new mapboxgl.Popup().setHTML(`
                        <div class="text-center">
                            <strong>Your Location</strong><br/>
                            <small>Accuracy: ~${Math.round(
							userLocation.accuracy || 0
						)}m</small>
                        </div>
                    `)
				)
				.addTo(mapRef.current);

			// Add search radius circle
			mapRef.current.addSource("radius", {
				type: "geojson",
				data: {
					type: "Feature",
					geometry: {
						type: "Point",
						coordinates: [userLocation.lng, userLocation.lat],
					},
				},
			});

			mapRef.current.addLayer({
				id: "radius",
				type: "circle",
				source: "radius",
				paint: {
					"circle-radius": {
						stops: [
							[0, 0],
							[
								20,
								((Math.pow(2, 20 - 10) * searchRadius * 1000) /
									40075017) *
									512,
							],
						],
						base: 2,
					},
					"circle-color": "#4299E1",
					"circle-opacity": 0.1,
					"circle-stroke-color": "#4299E1",
					"circle-stroke-width": 2,
					"circle-stroke-opacity": 0.5,
				},
			});

			// Add nearby bus stop markers
			nearbyBuses.forEach((bus) => {
				bus.nearbyStops.forEach((stop, idx) => {
					const marker = new mapboxgl.Marker({
						color: idx === 0 ? "#48BB78" : "#38A169", // Closest stop is darker green
					})
						.setLngLat([stop.lng, stop.lat])
						.setPopup(
							new mapboxgl.Popup().setHTML(`
                                <div>
                                    <strong>${stop.stopName}</strong><br/>
                                    <small>Bus: ${bus.busNo} - ${
									bus.busName
								}</small><br/>
                                    <small>Distance: ${formatDistanceKm(
									stop.distance
								)}</small><br/>
                                    <small>Time: ${
									stop.stopTime || "N/A"
								}</small>
                                </div>
                            `)
						)
						.addTo(mapRef.current);
				});
			});
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [userLocation, nearbyBuses, searchRadius]);

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
						<p className="text-gray-600">Loading bus data...</p>
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
					Nearby Buses
				</h1>
				<p className="text-gray-600">
					Find buses near your current location
				</p>
			</div>

			{/* Location Controls */}
			<div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div>
						<h2 className="text-lg font-semibold text-gray-900 mb-2">
							Your Location
						</h2>
						{userLocation ? (
							<div className="text-sm text-gray-600">
								<p>
									📍 {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
								</p>
								<p className="text-xs">
									Accuracy: ~{Math.round(userLocation.accuracy || 0)} meters
								</p>
							</div>
						) : (
							<p className="text-gray-500">Location not available</p>
						)}
					</div>

					<div className="flex flex-col sm:flex-row gap-3">
						<div className="flex items-center gap-2">
							<label className="text-sm font-medium text-gray-700">
								Search Radius:
							</label>
							<select
								value={searchRadius}
								onChange={(e) => setSearchRadius(parseInt(e.target.value))}
								className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
								<option value={1}>1 km</option>
								<option value={2}>2 km</option>
								<option value={5}>5 km</option>
								<option value={10}>10 km</option>
								<option value={20}>20 km</option>
							</select>
						</div>

						<button
							onClick={getCurrentLocation}
							disabled={gettingLocation}
							className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
							{gettingLocation ? (
								<>
									<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
									Getting Location...
								</>
							) : (
								<>📍 Get Location</>
							)}
						</button>
					</div>
				</div>

				{locationError && (
					<div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
						{locationError}
					</div>
				)}
			</div>

			{error && (
				<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
					{error}
				</div>
			)}

			{!userLocation ? (
				<div className="text-center py-12">
					<svg
						className="mx-auto h-12 w-12 text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<h3 className="mt-2 text-lg font-medium text-gray-900">Enable Location Access</h3>
					<p className="mt-1 text-sm text-gray-500">Click "Get Location" to find buses near you</p>
				</div>
			) : (
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Results List */}
					<div className="lg:col-span-1">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-xl font-semibold text-gray-900">Nearby Buses</h2>
							<span className="text-sm text-gray-500">{nearbyBuses.length} found</span>
						</div>

						{nearbyBuses.length === 0 ? (
							<div className="text-center py-8">
								<svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 014 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6H4a7.963 7.963 0 0117 0h1.5A1.5 1.5 0 0124 7.5v3a1.5 1.5 0 01-1.5 1.5H21a7.963 7.963 0 01-2 5.291z" />
								</svg>
								<h3 className="mt-2 text-sm font-medium text-gray-900">No buses found</h3>
								<p className="mt-1 text-sm text-gray-500">Try increasing the search radius</p>
							</div>
						) : (
							<div className="space-y-4 max-h-[600px] overflow-y-auto">
								{nearbyBuses.map((bus) => (
									<div key={bus.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
										{/* Bus Header */}
										<div className="flex justify-between items-start mb-3">
											<div>
												<h3 className="font-bold text-blue-600 text-lg">{bus.busNo}</h3>
												<p className="text-gray-700 font-medium">{bus.busName}</p>
												<p className="text-sm text-gray-500">Driver: {bus.driverName}</p>
											</div>
											<div className="text-right text-sm">
												<div className="font-medium text-gray-900">{formatDistanceKm(bus.minDistance)}</div>
												<div className="text-gray-500">away</div>
											</div>
										</div>

										{/* Bus Schedule */}
										<div className="text-sm text-gray-600 mb-3">
											<div className="flex items-center gap-4">
												<span>🕐 {formatTime(bus.startTime)} - {formatTime(bus.endTime)}</span>
												<span>👥 {bus.capacity} seats</span>
											</div>
										</div>

										{/* Nearby Stops */}
										<div>
											<h4 className="font-medium text-gray-900 mb-2">Nearest Stops ({bus.nearbyStops.length})</h4>
											<div className="space-y-2">
												{bus.nearbyStops.slice(0, 3).map((stop, idx) => (
													<div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
														<div>
															<div className="font-medium text-gray-900">{stop.stopName}</div>
															<div className="text-gray-600">Stop #
																{stop.stopNo} • {formatTime(stop.stopTime)}
															</div>
														</div>
														<div className="text-right">
															<div className="font-medium text-gray-900">{formatDistanceKm(stop.distance)}</div>
															<div className="text-xs text-gray-500">~{Math.round(stop.distance * 12)} min walk</div>
														</div>
													</div>
												))}
												{bus.nearbyStops.length > 3 && (
													<div className="text-center text-sm text-gray-500 py-1">+{bus.nearbyStops.length - 3} more stops within range</div>
												)}
											</div>
										</div>

										{/* Return Journey Badge */}
										{bus.returnJourney?.enabled && (
											<div className="mt-3">
												<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">↩️ Return Journey Available</span>
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</div>

					{/* Map */}
					<div className="lg:col-span-2">
						<div className="bg-white rounded-lg shadow-sm border">
							<div className="p-4 border-b border-gray-200">
								<div className="flex justify-between items-center">
									<div>
										<h2 className="text-xl font-semibold text-gray-900">Map View</h2>
										<p className="text-sm text-gray-600">Your location and nearby bus stops</p>
									</div>
									<div className="flex items-center gap-4 text-sm">
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 bg-red-500 rounded-full"></div>
											<span>You</span>
										</div>
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 bg-green-500 rounded-full"></div>
											<span>Bus Stops</span>
										</div>
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 border-2 border-blue-500 bg-blue-100 rounded-full"></div>
											<span>{searchRadius}km radius</span>
										</div>
									</div>
								</div>
								<div ref={mapContainer} className="w-full" style={{ height: "500px" }} />
							</div>

							{/* Stats */}
							{nearbyBuses.length > 0 && (
								<div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
									<div className="bg-white p-4 rounded-lg border text-center">
										<div className="text-2xl font-bold text-blue-600">{nearbyBuses.length}</div>
										<div className="text-sm text-gray-600">Buses Found</div>
									</div>
									<div className="bg-white p-4 rounded-lg border text-center">
										<div className="text-2xl font-bold text-green-600">{nearbyBuses.reduce((sum, bus) => sum + bus.nearbyStops.length, 0)}</div>
										<div className="text-sm text-gray-600">Total Stops</div>
									</div>
									<div className="bg-white p-4 rounded-lg border text-center">
										<div className="text-2xl font-bold text-purple-600">{nearbyBuses.length > 0 ? formatDistanceKm(nearbyBuses[0].minDistance) : "0 km"}</div>
										<div className="text-sm text-gray-600">Closest Stop</div>
									</div>
									<div className="bg-white p-4 rounded-lg border text-center">
										<div className="text-2xl font-bold text-orange-600">{nearbyBuses.filter((bus) => bus.returnJourney?.enabled).length}</div>
										<div className="text-sm text-gray-600">Return Routes</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Help Section */}
			<div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-semibold text-blue-900 mb-3">How it works</h3>
				<div className="grid md:grid-cols-3 gap-4 text-sm text-blue-800">
					<div className="flex items-start gap-2">
						<span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-xs font-bold">1</span>
						<div><strong>Share Location:</strong> Click "Get Location" to allow access to your current position</div>
					</div>
					<div className="flex items-start gap-2">
						<span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-xs font-bold">2</span>
						<div><strong>Set Radius:</strong> Choose how far you're willing to walk to a bus stop</div>
					</div>
					<div className="flex items-start gap-2">
						<span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify_center text-xs font-bold">3</span>
						<div><strong>Find Buses:</strong> See all buses with stops within your chosen distance</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default NearbyBusesPage;
