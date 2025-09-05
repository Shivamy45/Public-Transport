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
import "mapbox-gl/dist/mapbox-gl.css";
import { FaMapMarkerAlt } from "react-icons/fa";

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
	const [loadingSuggestions, setLoadingSuggestions] = useState(false);

	// Map state
	const [showMapModal, setShowMapModal] = useState(false);
	const [mapClickLocation, setMapClickLocation] = useState(null);
	const [routeLoading, setRouteLoading] = useState(false);

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

	// Stops for Map from firestore
	const [allStops, setAllStops] = useState([]);
	const [selectedTempStop, setSelectedTempStop] = useState(null);
	const [tempMarker, setTempMarker] = useState(null);

	// Utility functions
	const calculateJourneyTimes = (stops) => {
		if (!stops || stops.length === 0)
			return { startTime: null, endTime: null };
		return {
			startTime: stops[0].stopTime,
			endTime: stops[stops.length - 1].stopTime,
		};
	};

	const handleMoveStop = (stopId, direction) => {
		setStops((prevStops) => {
			const index = prevStops.findIndex((s) => s.stopId === stopId);
			if (index === -1) return prevStops;
			const newStops = [...prevStops];
			const [removed] = newStops.splice(index, 1);
			if (direction === "up") {
				newStops.splice(index - 1, 0, removed);
			} else {
				newStops.splice(index + 1, 0, removed);
			}
			return newStops;
		});
	};

	const handleRemoveStop = (stopId) => {
		setStops((prevStops) => prevStops.filter((s) => s.stopId !== stopId));
	};

	const updateMapWithStops = async () => {
		const stopsWithDetails = stops.map((stop) => ({
			...stop,
			lat: stop.lat ?? null,
			lng: stop.lng ?? null,
		}));

		// Remove old markers
		markersRef.current.forEach((m) => m.remove());
		markersRef.current = [];

		// Add numbered markers for all stops with valid coordinates
		stopsWithDetails.forEach((stop, idx) => {
			if (stop.lat != null && stop.lng != null) {
				const el = document.createElement("div");
				el.className =
					"w-6 h-6 bg-red-600 text-white text-xs flex items-center justify-center rounded-full border-2 border-white";
				el.innerText = idx + 1;
				const marker = new mapboxgl.Marker(el)
					.setLngLat([stop.lng, stop.lat])
					.addTo(mapRef.current);
				markersRef.current.push(marker);
			}
		});

		// Get valid coordinates
		const validCoords = stopsWithDetails
			.filter((s) => s.lat != null && s.lng != null)
			.map((s) => [s.lng, s.lat]);

		if (validCoords.length > 0) {
			const bounds = validCoords.reduce(
				(b, coord) => b.extend(coord),
				new mapboxgl.LngLatBounds(validCoords[0], validCoords[0])
			);
			mapRef.current.fitBounds(bounds, { padding: 80 });
		}

		if (validCoords.length > 1) {
			// Remove old route if exists
			if (mapRef.current.getLayer("routeLine"))
				mapRef.current.removeLayer("routeLine");
			if (mapRef.current.getSource("routeLine"))
				mapRef.current.removeSource("routeLine");

			// Prepare coordinates string for Directions API
			const coordinatesStr = validCoords
				.map((c) => c.join(","))
				.join(";");

			try {
				const response = await fetch(
					`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesStr}?geometries=geojson&overview=full&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
				);
				const data = await response.json();

				if (data.routes && data.routes[0]) {
					const routeGeoJson = {
						type: "Feature",
						geometry: data.routes[0].geometry,
					};

					mapRef.current.addSource("routeLine", {
						type: "geojson",
						data: routeGeoJson,
					});
					mapRef.current.addLayer({
						id: "routeLine",
						type: "line",
						source: "routeLine",
						paint: { "line-color": "#3B82F6", "line-width": 4 },
					});
				} else {
					throw new Error("No routes returned");
				}
			} catch (err) {
				console.error(
					"Directions API failed, drawing straight line:",
					err
				);
				const fallbackGeoJson = {
					type: "Feature",
					geometry: { type: "LineString", coordinates: validCoords },
				};
				mapRef.current.addSource("routeLine", {
					type: "geojson",
					data: fallbackGeoJson,
				});
				mapRef.current.addLayer({
					id: "routeLine",
					type: "line",
					source: "routeLine",
					paint: { "line-color": "#3B82F6", "line-width": 4 },
				});
			}
		}
	};

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

	//Fetch all stops from firestore
	useEffect(() => {
		async function fetchStops() {
			try {
				const querySnapshot = await getDocs(collection(db, "stops"));
				const stopsData = querySnapshot.docs.map((doc) => ({
					stopId: doc.id,
					...doc.data(),
				}));
				setAllStops(stopsData);
			} catch (err) {
				console.error("Failed to fetch stops", err);
			}
		}
		fetchStops();
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

		if (mapRef.current) {
			mapRef.current.remove();
		}

		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!mapboxgl.accessToken) {
			setError("Mapbox token not configured");
			return;
		}

		let center;
		if (
			stops.length > 0 &&
			stops[stops.length - 1].lat &&
			stops[stops.length - 1].lng
		) {
			center = [stops[stops.length - 1].lng, stops[stops.length - 1].lat];
		} else if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					mapRef.current.setCenter([
						pos.coords.longitude,
						pos.coords.latitude,
					]);
				},
				() => {
					mapRef.current.setCenter([77.209, 28.6139]);
				}
			);
			center = [77.209, 28.6139];
		} else {
			center = [77.209, 28.6139];
		}

		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center,
			zoom: 12,
			interactive: true,
		});
		mapRef.current.getCanvas().style.cursor = "crosshair";

		if (allStops.length > 0 && mapRef.current) {
			allStops.forEach((stop) => {
				// Show green, slightly larger marker if stop is in allStops but not in current route
				const isInRoute = stops.some((s) => s.stopId === stop.stopId);
				const markerEl = document.createElement("div");
				if (!isInRoute) {
					// Green, larger marker for available stops not in route
					markerEl.innerHTML =
						'<svg xmlns="http://www.w3.org/2000/svg" fill="#22c55e" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#bbf7d0"/><path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z" fill="#22c55e"/></svg>';
				} else {
					// Blue, normal marker for stops in route (legacy)
					markerEl.innerHTML =
						'<svg xmlns="http://www.w3.org/2000/svg" fill="#2563EB" viewBox="0 0 24 24" width="20" height="20"><path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z"/></svg>';
				}
				markerEl.style.cursor = "pointer";
				const marker = new mapboxgl.Marker(markerEl)
					.setLngLat([stop.lng, stop.lat])
					.addTo(mapRef.current);
				marker.getElement().addEventListener("click", () => {
					setStopPlace(stop.stopName);
					setMapClickLocation({ lat: stop.lat, lng: stop.lng });
					setShowMapModal(false);
				});
			});
		}

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
		updateMapWithStops();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stops]);

	const handleMapClick = async (e) => {
		const { lng, lat } = e.lngLat;

		if (tempMarker) tempMarker.remove();

		const marker = new mapboxgl.Marker({ color: "red", draggable: true })
			.setLngLat([lng, lat])
			.addTo(mapRef.current);

		setTempMarker(marker);

		const updateStopInfo = async (lng, lat) => {
			try {
				const response = await fetch(
					`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
				);
				const data = await response.json();
				const placeName =
					data.features?.[0]?.place_name ||
					`Location ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
				setSelectedTempStop({ lat, lng, stopName: placeName });
			} catch {
				setSelectedTempStop({
					lat,
					lng,
					stopName: `Location ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
				});
			}
		};

		await updateStopInfo(lng, lat);

		marker.on("dragend", () => {
			const pos = marker.getLngLat();
			updateStopInfo(pos.lng, pos.lat);
		});
	};

	// Helper to compute elapsed minutes from "HH:MM" string, handling cross-midnight and day offsets
	const computeElapsedMinutes = (
		start,
		end,
		startDayOffset = 0,
		endDayOffset = 0
	) => {
		// start, end: "HH:MM"
		const [sh, sm] = start.split(":").map(Number);
		const [eh, em] = end.split(":").map(Number);
		let startMinutes = sh * 60 + sm + (startDayOffset || 0) * 24 * 60;
		let endMinutes = eh * 60 + em + (endDayOffset || 0) * 24 * 60;
		let diff = endMinutes - startMinutes;
		return diff;
	};

	const handleAddStop = async () => {
		setError("");

		if (!stopPlace.trim()) {
			setError("Please enter a stop name.");
			return;
		}

		if (!stopTime) {
			setError("Please select a stop time.");
			return;
		}

		try {
			let stopId = `stop_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`;
			let lat = null;
			let lng = null;

			// Check if stop exists in allStops by name
			const match = allStops.find(
				(s) =>
					s.stopName.trim().toLowerCase() ===
					stopPlace.trim().toLowerCase()
			);
			if (match) {
				stopId = match.stopId;
				lat = match.lat;
				lng = match.lng;
			} else if (stopPlace) {
				// Fetch coordinates from Mapbox
				const response = await fetch(
					`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
						stopPlace
					)}.json?country=IN&limit=1&access_token=${
						process.env.NEXT_PUBLIC_MAPBOX_TOKEN
					}`
				);
				const data = await response.json();
				const center = data.features?.[0]?.center;
				if (center) [lng, lat] = center;
			}

			// Prevent duplicate stops
			const alreadyAdded = stops.some(
				(s) =>
					(s.stopId === stopId && match) ||
					(!match &&
						s.stopName.trim().toLowerCase() ===
							stopPlace.trim().toLowerCase())
			);
			if (alreadyAdded) {
				alert("This stop is already added to the route.");
				return;
			}

			// Determine dayOffset
			let dayOffset = 0;
			if (stops.length > 0) {
				const lastStop = stops[stops.length - 1];
				const prevMinutes = lastStop.stopTime
					.split(":")
					.map(Number)
					.reduce((h, m) => h * 60 + m, 0);
				const currMinutes = stopTime
					.split(":")
					.map(Number)
					.reduce((h, m) => h * 60 + m, 0);
				if (currMinutes < prevMinutes) {
					const confirmNextDay = window.confirm(
						"Is this stop on the next day?"
					);
					if (confirmNextDay)
						dayOffset = (lastStop.dayOffset || 0) + 1;
					else {
						setError(
							"Stop time must be after the previous stop. If next day, confirm."
						);
						return;
					}
				} else {
					dayOffset = lastStop.dayOffset || 0;
				}
			}

			const newStop = {
				stopId,
				stopName: stopPlace.trim(),
				stopTime,
				dayOffset,
				lat,
				lng,
			};

			// Add new stop to Firestore if it does not exist
			if (!match) {
				const stopsRef = collection(db, "stops");
				await addDoc(stopsRef, {
					stopName: newStop.stopName,
					lat,
					lng,
					buses: [],
				});
			}

			setStops((prev) => [...prev, newStop]);
			updateMapWithStops();

			setStopPlace("");
			setStopTime("");
			setStopSuggestions([]);
			setMapClickLocation(null);
		} catch (err) {
			console.error("Error adding stop:", err);
			setError("Failed to add stop. Please try again.");
		}
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		if (submitting) return;

		setError("");
		setSuccess("");

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
			setSubmitting(true);

			const normalizedBusNo = busNo.trim().toUpperCase();

			const busesRef = collection(db, "buses");
			const dupQuery = query(
				busesRef,
				where("busNo", "==", normalizedBusNo)
			);
			const dupSnap = await getDocs(dupQuery);
			if (!dupSnap.empty) {
				setError("A bus with this number already exists.");
				setSubmitting(false);
				return;
			}

			// Only store stopId, stopTime, dayOffset in the bus document
			const busStops = stops.map((s) => ({
				stopId: s.stopId,
				stopTime: s.stopTime,
				...(s.dayOffset ? { dayOffset: s.dayOffset } : {}),
			}));

			const busPayload = {
				busNo: normalizedBusNo,
				busName: busName.trim(),
				driverName: driverName.trim(),
				capacity: parseInt(capacity),
				currLoad: 0,
				stops: busStops,
				status: {
					current: "Not Started",
					currentStopIndex: 0,
					isReturn: false,
				},
				location: { lat: null, lng: null, lastUpdated: null },
				createdAt: serverTimestamp(),
				createdBy: currentUser.email,
			};

			const newBusDoc = await addDoc(busesRef, busPayload);

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

			// 🔑 Sync stops collection
			for (const stop of stops) {
				// Find stop details in allStops
				const stopDetails = allStops.find(
					(s) => s.stopId === stop.stopId
				);
				const stopsRef = collection(db, "stops");
				if (stopDetails) {
					const stopDocRef = doc(db, "stops", stopDetails.stopId);
					await updateDoc(stopDocRef, {
						buses: arrayUnion(newBusDoc.id),
					});
				}
				// If not found, do not create new stop here (since we don't have lat/lng)
			}

			setSuccess("Bus added successfully!");

			setBusNo("");
			setBusName("");
			setDriverName("");
			setCapacity("");
			setReturnJourneyEnabled(false);
			setReturnStartTime("");
			setStops([]);

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
		<>
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
									onChange={(e) =>
										setDriverName(e.target.value)
									}
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
									onChange={(e) =>
										setCapacity(e.target.value)
									}
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
										setReturnJourneyEnabled(
											e.target.checked
										)
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
								</label>
								<input
									type="time"
									value={stopTime}
									onChange={(e) =>
										setStopTime(e.target.value)
									}
									className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
									required={false}
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
									{returnJourneyEnabled &&
										returnStartTime && (
											<span className="block mt-1 text-green-600">
												Return journey starts at{" "}
												{returnStartTime}
											</span>
										)}
								</p>

								<div className="bg-white rounded-lg border overflow-hidden">
									<div className="overflow-x-auto">
										<table className="w-full">
											<thead className="bg-gray-100">
												<tr>
													<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
														Stop Order
													</th>
													<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
														Stop Name
													</th>
													<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
														Time
													</th>
													{/* Removed GPS column */}
													<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
														Actions
													</th>
												</tr>
											</thead>
											<tbody className="bg-white divide-y divide-gray-200">
												{stops.map((stop, index) => {
													const stopDetails =
														allStops.find(
															(s) =>
																s.stopId ===
																stop.stopId
														);
													return (
														<tr
															key={stop.stopId}
															className="hover:bg-gray-50">
															<td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
																{index + 1}
															</td>
															<td className="px-4 py-4 text-sm text-gray-900">
																{stopDetails ? (
																	stopDetails.stopName
																) : (
																	<span className="italic text-gray-700">
																		{stop.stopName ||
																			"New Stop"}
																	</span>
																)}
															</td>
															<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
																{stop.stopTime}
																{stop.dayOffset ? (
																	<span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
																		+
																		{
																			stop.dayOffset
																		}{" "}
																		day
																	</span>
																) : null}
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
																			index ===
																			0
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
													);
												})}
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
				{/* form omitted for brevity */}
				{showMapModal && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
						<div className="w-full max-w-6xl h-[80vh] rounded-xl bg-white relative overflow-hidden">
							<div className="flex justify-between items-center p-4 border-b">
								<h3 className="text-lg font-bold">
									Route Map View
								</h3>
								<p>
									{stops.length} stops added • Click on the
									map to add a stop
									{routeLoading && (
										<span className="ml-2 text-blue-600">
											• Calculating route...
										</span>
									)}
								</p>
								<button onClick={() => setShowMapModal(false)}>
									✕
								</button>
							</div>
							<div className="relative flex-1 h-full">
								{selectedTempStop && (
									<div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white shadow-md rounded p-3 z-20">
										<p className="text-sm font-medium">
											{selectedTempStop.stopName}
										</p>
										<div className="flex space-x-2 mt-2">
											<button
												className="px-3 py-1 bg-blue-600 text-white text-sm rounded"
												onClick={() => {
													setStopPlace(
														selectedTempStop.stopName
													);
													setMapClickLocation({
														lat: selectedTempStop.lat,
														lng: selectedTempStop.lng,
													});
													setSelectedTempStop(null);
													if (tempMarker) {
														tempMarker.remove();
														setTempMarker(null);
													}
													setShowMapModal(false);
												}}>
												Select
											</button>
											<button
												className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded"
												onClick={() => {
													if (tempMarker) {
														tempMarker.remove();
														setTempMarker(null);
													}
													setSelectedTempStop(null);
												}}>
												Cancel
											</button>
										</div>
									</div>
								)}
								<div
									ref={mapContainer}
									className="w-full h-full"
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
};

export default AddBus;
