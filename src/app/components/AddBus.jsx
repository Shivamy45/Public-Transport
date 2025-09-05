"use client";

import React, { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import {
	collection,
	addDoc,
	serverTimestamp,
	query,
	where,
	getDocs,
	doc,
	updateDoc,
	arrayUnion,
} from "firebase/firestore";
import mapboxgl from "mapbox-gl";

const AddBus = ({ onSuccess }) => {
	// Form state
	const [busNo, setBusNo] = useState("");
	const [busName, setBusName] = useState("");
	const [driverName, setDriverName] = useState("");
	const [capacity, setCapacity] = useState("");
	const [returnJourneyEnabled, setReturnJourneyEnabled] = useState(false);
	const [returnStartTime, setReturnStartTime] = useState("");

	// Stop management state
	const [stops, setStops] = useState([]);
	const [stopPlace, setStopPlace] = useState("");
	const [stopTime, setStopTime] = useState("");
	const [stopSuggestions, setStopSuggestions] = useState([]);
	const [selectedStop, setSelectedStop] = useState(null);
	const [loadingSuggestions, setLoadingSuggestions] = useState(false);

	// Map state
	const [showMapModal, setShowMapModal] = useState(false);
	const [mapClickLocation, setMapClickLocation] = useState(null);
	const [isAddingFromMap, setIsAddingFromMap] = useState(false);

	// Form submission state
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	// User state
	const [currentUser, setCurrentUser] = useState(null);

	// Map references
	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const routeLineRef = useRef(null);

	// Load current user
	useEffect(() => {
		try {
			const saved =
				typeof window !== "undefined"
					? localStorage.getItem("currentUser")
					: null;
			if (saved) {
				setCurrentUser(JSON.parse(saved));
			}
		} catch (err) {
			console.error("Error loading user:", err);
		}
	}, []);

	// Fetch location suggestions from Mapbox
	useEffect(() => {
		if (stopPlace.length < 3) {
			setStopSuggestions([]);
			return;
		}

		const timeoutId = setTimeout(async () => {
			if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
				console.warn("Mapbox token not configured");
				return;
			}

			try {
				setLoadingSuggestions(true);
				const response = await fetch(
					`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
						stopPlace
					)}.json?country=IN&limit=5&access_token=${
						process.env.NEXT_PUBLIC_MAPBOX_TOKEN
					}`
				);

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const data = await response.json();
				setStopSuggestions(data.features || []);
			} catch (err) {
				console.error("Error fetching suggestions:", err);
				setStopSuggestions([]);
			} finally {
				setLoadingSuggestions(false);
			}
		}, 300);

		return () => clearTimeout(timeoutId);
	}, [stopPlace]);

	// Initialize Map
	useEffect(() => {
		if (!showMapModal || !mapContainer.current) return;

		// Clean up existing map
		if (mapRef.current) {
			mapRef.current.remove();
		}

		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!mapboxgl.accessToken) {
			setError("Mapbox token not configured");
			return;
		}

		// Initialize map
		const center =
			stops.length > 0 && stops[0].lat && stops[0].lng
				? [stops[0].lng, stops[0].lat]
				: [77.209, 28.6139]; // Default to Delhi

		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center,
			zoom: 12,
			interactive: true
		});
		// Set crosshair cursor for map for adding stops
		mapRef.current.getCanvas().style.cursor = "crosshair";

		// Add click handler for adding stops from map immediately after map creation
		mapRef.current.on("click", handleMapClick);

		mapRef.current.on("load", () => {
			updateMapWithStops();
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.off("click", handleMapClick);
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [showMapModal]);

	// Update map when stops change
	useEffect(() => {
		if (mapRef.current && mapRef.current.loaded()) {
			updateMapWithStops();
		}
	}, [stops]);

	const updateMapWithStops = async () => {
		if (!mapRef.current) return;

		// Clear existing markers
		markersRef.current.forEach((marker) => marker.remove());
		markersRef.current = [];

		// Remove existing route line
		if (routeLineRef.current) {
			if (mapRef.current.getLayer("route")) {
				mapRef.current.removeLayer("route");
			}
			if (mapRef.current.getSource("route")) {
				mapRef.current.removeSource("route");
			}
			routeLineRef.current = null;
		}

		const validStops = stops.filter((stop) => stop.lat && stop.lng);

		// Add stop markers
		validStops.forEach((stop, index) => {
			const marker = new mapboxgl.Marker({
				color:
					index === 0
						? "#10B981"
						: index === validStops.length - 1
						? "#EF4444"
						: "#3B82F6",
				scale: 0.8,
			})
				.setLngLat([stop.lng, stop.lat])
				.setPopup(
					new mapboxgl.Popup().setHTML(`
						<div class="p-2">
							<strong>Stop ${stop.stopNo}: ${stop.stopName}</strong><br/>
							<small>Time: ${stop.stopTime}</small><br/>
							<small class="text-gray-500">${
								index === 0
									? "Start"
									: index === validStops.length - 1
									? "End"
									: "Stop"
							}</small>
						</div>
					`)
				)
				.addTo(mapRef.current);

			markersRef.current.push(marker);
		});

		// Add route line connecting stops
		if (validStops.length > 1) {
			let routeFeature = null;
			try {
				routeFeature = await fetchDirectionsRoute(validStops);
			} catch (e) {
				console.error("Directions API failed, falling back to straight line:", e);
			}

			// Fallback to straight line if routing unavailable
			if (!routeFeature) {
				routeFeature = {
					type: "Feature",
					properties: {},
					geometry: {
						type: "LineString",
						coordinates: validStops.map((stop) => [stop.lng, stop.lat]),
					},
				};
			}

			mapRef.current.addSource("route", {
				type: "geojson",
				data: routeFeature,
			});

			mapRef.current.addLayer({
				id: "route",
				type: "line",
				source: "route",
				layout: { "line-join": "round", "line-cap": "round" },
				paint: {
					"line-color": "#3B82F6",
					"line-width": 3,
					"line-opacity": 0.8,
				},
			});

			routeLineRef.current = true;

			// Fit map to show the route
			try {
				const coords =
					routeFeature.geometry.type === "LineString"
						? routeFeature.geometry.coordinates
						: [];
				if (coords.length > 0) {
					const bounds = new mapboxgl.LngLatBounds();
					coords.forEach((c) => bounds.extend(c));
					mapRef.current.fitBounds(bounds, { padding: 50 });
				}
			} catch (_) {
				// ignore fit errors
			}
		}
	};

	const fetchDirectionsRoute = async (orderedStops) => {
		const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!token) return null;
		const coords = orderedStops
			.filter((s) => s.lng && s.lat)
			.map((s) => `${s.lng},${s.lat}`)
			.join(";");
		if (!coords || coords.split(";").length < 2) return null;

		const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${token}`;
		const res = await fetch(url);
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || !data.routes || data.routes.length === 0) return null;
		const geometry = data.routes[0].geometry; // GeoJSON LineString
		if (!geometry || geometry.type !== "LineString") return null;
		return {
			type: "Feature",
			properties: {},
			geometry,
		};
	};

	const handleMapClick = async (e) => {
		if (!isAddingFromMap) return; 
		console.log("is clicked on ", e.lngLat)
		const { lng, lat } = e.lngLat;
		setMapClickLocation({ lat, lng });

		try {
			const response = await fetch(
				`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
			);
			const data = await response.json();

			if (data.features && data.features.length > 0) {
				setStopPlace(data.features[0].place_name);
			} else {
				setStopPlace(`Location ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
			}
		} catch (err) {
			console.error("Reverse geocoding failed:", err);
			setStopPlace(`Location ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
		}

		// Reset time so user must add it manually
		setStopTime("");

		// Close the map modal immediately
		setShowMapModal(false);

		// Do NOT reset isAddingFromMap here, keep it true until stop is confirmed
	};

	// Helper function to convert time string to minutes since midnight
	const timeToMinutes = (timeStr) => {
		if (!timeStr) return 0;
		const [hours, minutes] = timeStr.split(":").map(Number);
		return hours * 60 + minutes;
	};

	// Helper function to convert minutes since midnight to time string
	const minutesToTime = (minutes) => {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
	};

	// Calculate journey start and end times from stops
	const calculateJourneyTimes = (stopsList) => {
		if (stopsList.length === 0) return { startTime: "", endTime: "" };

		// Sort stops by their time in minutes since midnight
		const sortedStops = [...stopsList].sort((a, b) => {
			const timeA = timeToMinutes(a.stopTime);
			const timeB = timeToMinutes(b.stopTime);
			return timeA - timeB;
		});

		return {
			startTime: sortedStops[0]?.stopTime || "",
			endTime: sortedStops[sortedStops.length - 1]?.stopTime || "",
		};
	};

	// Calculate return journey stops with reversed order and calculated times
	const calculateReturnJourney = (stopsList, returnStartTime) => {
		if (stopsList.length === 0) return [];

		// Sort stops by time to get correct order
		const sortedStops = [...stopsList].sort((a, b) => {
			const timeA = timeToMinutes(a.stopTime);
			const timeB = timeToMinutes(b.stopTime);
			return timeA - timeB;
		});

		// Calculate time differences between consecutive stops
		const timeDifferences = [];
		for (let i = 0; i < sortedStops.length - 1; i++) {
			const currentTime = timeToMinutes(sortedStops[i].stopTime);
			const nextTime = timeToMinutes(sortedStops[i + 1].stopTime);
			timeDifferences.push(nextTime - currentTime);
		}

		// Start return journey from the return start time
		let currentReturnTime = timeToMinutes(returnStartTime);
		const returnStops = [];

		// Reverse the stops and calculate times
		for (let i = sortedStops.length - 1; i >= 0; i--) {
			const originalStop = sortedStops[i];
			const returnStop = {
				...originalStop,
				stopId: `return_${originalStop.stopId}`,
				stopNo: sortedStops.length - i, // Reverse stop numbers
				stopTime: minutesToTime(currentReturnTime),
			};
			returnStops.push(returnStop);

			// Add time difference for next stop (going backwards)
			if (i > 0) {
				const timeDiff = timeDifferences[i - 1];
				currentReturnTime += timeDiff;
			}
		}

		return returnStops;
	};

	// Add stop to the route
	const handleAddStop = async () => {
		setError("");

		if (!stopPlace.trim()) {
			setError("Please enter a stop name.");
			return;
		}

		if (!stopTime) {
			const errorMessage = isAddingFromMap 
				? "Please enter a stop time to confirm the location from the map."
				: "Please select a stop time.";
			setError(errorMessage);
			return;
		}

		// Check for duplicate stops using GPS coordinates first, then fallback to name
		let duplicateType = null;
		const isDuplicate = stops.some((stop) => {
			// If we have coordinates from map click or selected suggestion
			const hasCoordinates = mapClickLocation || (selectedStop && selectedStop.center);
			
			if (hasCoordinates) {
				// Check if this stop has GPS coordinates
				if (stop.lat && stop.lng) {
					// Get coordinates to compare
					let newLat, newLng;
					if (mapClickLocation) {
						newLat = mapClickLocation.lat;
						newLng = mapClickLocation.lng;
					} else if (selectedStop && selectedStop.center) {
						newLat = selectedStop.center[1];
						newLng = selectedStop.center[0];
					}
					
					// Compare GPS coordinates (within ~10 meters tolerance)
					if (newLat && newLng) {
						const latDiff = Math.abs(stop.lat - newLat);
						const lngDiff = Math.abs(stop.lng - newLng);
						const tolerance = 0.0001; // ~10 meters
						
						if (latDiff < tolerance && lngDiff < tolerance) {
							duplicateType = "location";
							return true; // Same location
						}
					}
				}
			}
			
			// Fallback to name comparison
			if (stop.stopName.toLowerCase() === stopPlace.toLowerCase()) {
				duplicateType = "name";
				return true;
			}
			return false;
		});

		if (isDuplicate) {
			const errorMessage = duplicateType === "location" 
				? "A stop at this location has already been added to the route."
				: "A stop with this name has already been added to the route.";
			setError(errorMessage);
			return;
		}

		try {
			let coordinates = { lat: null, lng: null };

			// Use coordinates from map click if available
			if (mapClickLocation) {
				coordinates = mapClickLocation;
				setMapClickLocation(null);
			} else if (selectedStop && selectedStop.center) {
				coordinates.lat = selectedStop.center[1];
				coordinates.lng = selectedStop.center[0];
			}

			const newStop = {
				stopId: `stop_${Date.now()}_${Math.random()
					.toString(36)
					.substr(2, 9)}`,
				stopName: stopPlace.trim(),
				stopNo: stops.length + 1,
				stopTime,
				lat: coordinates.lat,
				lng: coordinates.lng,
			};

			setStops((prevStops) => [...prevStops, newStop]);

			// Reset form and map state
			setStopPlace("");
			setStopTime("");
			setStopSuggestions([]);
			setSelectedStop(null);
			setMapClickLocation(null);

			// Exit "Add from Map" mode after successful addition
			setIsAddingFromMap(false);
		} catch (err) {
			console.error("Error adding stop:", err);
			setError("Failed to add stop. Please try again.");
		}
	};

	// Remove a stop
	const handleRemoveStop = (stopId) => {
		setStops((prevStops) => {
			const filtered = prevStops.filter((stop) => stop.stopId !== stopId);
			return filtered.map((stop, index) => ({
				...stop,
				stopNo: index + 1,
			}));
		});
	};

	// Move stop up/down in the order
	const handleMoveStop = (stopId, direction) => {
		setStops((prevStops) => {
			const currentIndex = prevStops.findIndex(
				(stop) => stop.stopId === stopId
			);
			const newIndex =
				direction === "up" ? currentIndex - 1 : currentIndex + 1;

			if (newIndex < 0 || newIndex >= prevStops.length) return prevStops;

			const newStops = [...prevStops];
			[newStops[currentIndex], newStops[newIndex]] = [
				newStops[newIndex],
				newStops[currentIndex],
			];

			return newStops.map((stop, index) => ({
				...stop,
				stopNo: index + 1,
			}));
		});
	};

	// Submit the form
	const handleSubmit = async (event) => {
		event.preventDefault();
		// Guard against double submission
		if (submitting) return;

		setError("");
		setSuccess("");

		// Basic validation
		if (!currentUser || currentUser.role !== "admin") {
			setError("Only admins can add buses.");
			return;
		}

		if (
			!busNo.trim() ||
			!busName.trim() ||
			!driverName.trim() ||
			!capacity
		) {
			setError("Please fill all required fields.");
			return;
		}

		if (parseInt(capacity) <= 0) {
			setError("Capacity must be a positive number.");
			return;
		}

		if (stops.length < 2) {
			setError("Please add at least 2 stops to create a route.");
			return;
		}

		if (returnJourneyEnabled && !returnStartTime) {
			setError("Please specify return journey start time.");
			return;
		}

		try {
			// Immediately disable the button
			setSubmitting(true);

			// Normalize bus number for dedupe checks
			const normalizedBusNo = busNo.trim().toUpperCase();

			// Check for duplicate bus number in Firestore
			const busesRef = collection(db, "buses");
			const dupQuery = query(busesRef, where("busNo", "==", normalizedBusNo));
			const dupSnap = await getDocs(dupQuery);
			if (!dupSnap.empty) {
				setError("A bus with this number already exists.");
				setSubmitting(false);
				return;
			}

			// Calculate journey times automatically from stops
			const journeyTimes = calculateJourneyTimes(stops);

			// Calculate return journey stops if enabled
			let returnStops = [];
			if (returnJourneyEnabled && returnStartTime) {
				returnStops = calculateReturnJourney(stops, returnStartTime);
			}

			const busPayload = {
				busNo: normalizedBusNo,
				busName: busName.trim(),
				driverName: driverName.trim(),
				capacity: parseInt(capacity),
				currLoad: 0,
				startTime: journeyTimes.startTime,
				endTime: journeyTimes.endTime,
				stops: stops,
				returnStops: returnStops, // Store return journey stops
				returnJourney: returnJourneyEnabled
					? { enabled: true, startTime: returnStartTime }
					: { enabled: false },
				status: {
					current: "Not Started",
					currentStopIndex: 0,
					isReturn: false,
				},
				location: {
					lat: null,
					lng: null,
					lastUpdated: null,
				},
				createdAt: serverTimestamp(),
				createdBy: currentUser.email,
			};

			// Create new bus document (single entry)
			const newBusDoc = await addDoc(busesRef, busPayload);

			// Update admin's buses array
			const usersRef = collection(db, "users");
			const adminQuery = query(
				usersRef,
				where("email", "==", currentUser.email)
			);
			const adminSnap = await getDocs(adminQuery);

			if (!adminSnap.empty) {
				const adminDocRef = doc(db, "users", adminSnap.docs[0].id);
				await updateDoc(adminDocRef, {
					buses: arrayUnion(newBusDoc.id),
				});
			}

			setSuccess("Bus added successfully!");

			// Reset form
			setBusNo("");
			setBusName("");
			setDriverName("");
			setCapacity("");
			setReturnJourneyEnabled(false);
			setReturnStartTime("");
			setStops([]);

			// Call success callback
			if (onSuccess) {
				setTimeout(() => onSuccess(), 1500);
			}
		} catch (err) {
			console.error("Error adding bus:", err);
			setError("Failed to add bus. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="max-w-4xl mx-auto">
			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Status Messages */}
				{error && (
					<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
						{error}
					</div>
				)}
				{success && (
					<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
						{success}
					</div>
				)}

				{/* Bus Information Section */}
				<div className="bg-gray-50 p-6 rounded-lg">
					<h3 className="text-lg font-semibold mb-4 text-gray-900">
						Bus Information
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Bus Number *
							</label>
							<input
								type="text"
								value={busNo}
								onChange={(e) => setBusNo(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
								placeholder="e.g., 42A"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Bus Name *
							</label>
							<input
								type="text"
								value={busName}
								onChange={(e) => setBusName(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
								placeholder="e.g., City Express"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Driver Name *
							</label>
							<input
								type="text"
								value={driverName}
								onChange={(e) => setDriverName(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
								placeholder="e.g., John Doe"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Capacity *
							</label>
							<input
								type="number"
								value={capacity}
								onChange={(e) => setCapacity(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
								placeholder="e.g., 40"
								min="1"
								required
							/>
						</div>
					</div>

					<div className="mt-4">
						<label className="inline-flex items-center">
							<input
								type="checkbox"
								checked={returnJourneyEnabled}
								onChange={(e) =>
									setReturnJourneyEnabled(e.target.checked)
								}
								className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span className="ml-2 text-sm text-gray-700">
								Enable Return Journey
							</span>
						</label>
					</div>

					{returnJourneyEnabled && (
						<div className="mt-4 max-w-md">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Return Start Time *
							</label>
							<input
								type="time"
								value={returnStartTime}
								onChange={(e) =>
									setReturnStartTime(e.target.value)
								}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
								required={returnJourneyEnabled}
							/>
						</div>
					)}
				</div>

				{/* Route Stops Section */}
				<div className="bg-gray-50 p-6 rounded-lg">
					<div className="flex justify-between items-center mb-4">
						<h3 className="text-lg font-semibold text-gray-900">
							Route Stops
						</h3>
						<button
							type="button"
							onClick={() => setShowMapModal(true)}
							className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
							🗺️ Open Map View
						</button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Stop Name
								{mapClickLocation && (
									<span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
										📍 From Map
									</span>
								)}
							</label>
							<div className="relative">
								<input
									type="text"
									value={stopPlace}
									onChange={(e) => {
										setStopPlace(e.target.value);
										setSelectedStop(null);
									}}
									className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-gray-900 ${
										mapClickLocation 
											? "border-green-300 focus:ring-green-500 bg-green-50" 
											: "border-gray-300 focus:ring-blue-500"
									}`}
									placeholder="e.g., Main Street, Central Station"
									autoComplete="off"
								/>
								{loadingSuggestions && (
									<div className="absolute right-3 top-3">
										<div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
									</div>
								)}
							</div>

							{stopSuggestions.length > 0 && (
								<div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-auto">
									{stopSuggestions.map((suggestion) => (
										<div
											key={suggestion.id}
											className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
											onClick={() => {
												setStopPlace(
													suggestion.place_name
												);
												setSelectedStop(suggestion);
												setStopSuggestions([]);
											}}>
											<div className="font-medium text-sm">
												{suggestion.text}
												</div>
											<div className="text-xs text-gray-600">
												{suggestion.place_name}
												</div>
											</div>
									))}
								</div>
							)}
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Stop Time
								{isAddingFromMap && mapClickLocation && (
									<span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
										⚠️ Required
									</span>
								)}
							</label>
							<input
								type="time"
								value={stopTime}
								onChange={(e) => setStopTime(e.target.value)}
								className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-gray-900 ${
									isAddingFromMap && mapClickLocation && !stopTime
										? "border-yellow-300 focus:ring-yellow-500 bg-yellow-50" 
										: "border-gray-300 focus:ring-blue-500"
								}`}
								required={isAddingFromMap && mapClickLocation}
							/>
						</div>
					</div>

					<button
						type="button"
						onClick={handleAddStop}
						disabled={!stopPlace.trim() || !stopTime}
						className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors">
						Add Stop
					</button>

					{/* Added Stops List */}
					{stops.length > 0 && (
						<div className="mt-6">
							<h4 className="font-semibold mb-3 text-gray-900">
								Added Stops ({stops.length})
							</h4>
							<p className="text-sm text-gray-600 mb-3">
								Journey will start at{" "}
								<strong>
									{calculateJourneyTimes(stops).startTime}
								</strong>{" "}
								and end at{" "}
								<strong>
									{calculateJourneyTimes(stops).endTime}
								</strong>
								{returnJourneyEnabled && returnStartTime && (
									<span className="block mt-1 text-green-600">
										Return journey starts at {returnStartTime}
									</span>
								)}
							</p>

							<div className="bg-white rounded-lg border overflow-hidden">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead className="bg-gray-100">
											<tr>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Stop #
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Stop Name
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Time
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													GPS
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Actions
												</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{stops.map((stop, index) => (
												<tr
													key={stop.stopId}
													className="hover:bg-gray-50">
													<td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
														{stop.stopNo}
													</td>
													<td className="px-4 py-4 text-sm text-gray-900">
														{stop.stopName}
													</td>
													<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
														{stop.stopTime}
													</td>
													<td className="px-4 py-4 whitespace-nowrap text-sm">
														{stop.lat &&
														stop.lng ? (
															<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
																✓ Located
															</span>
														) : (
															<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
																! No GPS
															</span>
														)}
													</td>
													<td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
														<div className="flex space-x-2">
															<button
																type="button"
																onClick={() =>
																	handleMoveStop(
																		stop.stopId,
																		"up"
																	)
															}
																disabled={
																	index === 0
																	}
																className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
																title="Move Up">
																↑
															</button>
															<button
																type="button"
																onClick={() =>
																	handleMoveStop(
																		stop.stopId,
																		"down"
																	)
															}
																disabled={
																	index ===
																		stops.length -
																			1
																	}
																className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
																title="Move Down">
																↓
															</button>
															<button
																type="button"
																onClick={() =>
																	handleRemoveStop(
																		stop.stopId
																	)
															}
															className="text-red-600 hover:text-red-900"
																title="Remove Stop">
																✕
															</button>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Submit Button */}
				<div className="flex justify-end space-x-4">
					<button
						type="button"
						onClick={() => {
							setBusNo("");
							setBusName("");
							setDriverName("");
							setCapacity("");
							setReturnJourneyEnabled(false);
							setReturnStartTime("");
							setStops([]);
							setError("");
							setSuccess("");
						}}
						className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
						Reset Form
					</button>

					<button
						type="submit"
						disabled={submitting || stops.length < 2}
						className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors">
						{submitting ? (
							<span className="flex items-center">
								<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
								Adding Bus...
							</span>
						) : (
							`Add Bus ${
								stops.length >= 2
									? `(${stops.length} stops)`
									: ""
							}`
						)}
					</button>
				</div>

			</form>

			{/* Map Modal */}
			{showMapModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
					<div className="w-full max-w-6xl h-[80vh] rounded-xl bg-white text-black relative overflow-hidden shadow-2xl">
						{/* Map Header */}
						<div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
							<div>
								<h3 className="text-lg font-bold text-gray-900">
									Route Map View
								</h3>
								<p className="text-sm text-gray-600">
									{stops.length} stops added • Click "Add from
									Map" then click on the map to add a stop
								</p>
							</div>
							<div className="flex items-center gap-3">
								<button
									onClick={() =>
										setIsAddingFromMap(!isAddingFromMap)
									}
									className={`px-4 py-2 rounded-lg font-medium transition-colors ${
										isAddingFromMap
											? "bg-red-600 hover:bg-red-700 text-white"
											: "bg-green-600 hover:bg-green-700 text-white"
									}`}> 
									{isAddingFromMap
										? "Cancel Adding"
										: "Add from Map"}
								</button>
								<button
									onClick={() => setShowMapModal(false)}
									className="p-2 hover:bg-gray-100 rounded-full transition-colors"
									aria-label="Close map">
									<svg
										className="h-6 w-6 text-gray-600"
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

						{/* Map Container */}
						<div className="relative flex-1 h-full">
							<div
								ref={mapContainer}
								className="w-full h-full"
								style={{ height: "calc(80vh - 80px)" }}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default AddBus;
