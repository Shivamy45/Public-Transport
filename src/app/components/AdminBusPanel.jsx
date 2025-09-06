import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import {
	doc,
	onSnapshot,
	updateDoc,
	setDoc,
	collection,
	getDoc,
	getDocs,
	where,
	query,
	serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MapPin, Clock, Users, Navigation } from "lucide-react";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const AdminBusCard = ({ busId }) => {
	// ------------------- STATE -------------------

	const [bus, setBus] = useState(null);
	const [stops, setStops] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [driverLocation, setDriverLocation] = useState(null);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [etaNextStop, setEtaNextStop] = useState(null);
	const [etaFinalStop, setEtaFinalStop] = useState(null);
	const [delayed, setDelayed] = useState(false);
	const [currentStopIndex, setCurrentStopIndex] = useState(0);

	const [isJourneyStarted, setIsJourneyStarted] = useState(false);
	const [isJourneyPaused, setIsJourneyPaused] = useState(false);
	// simulationSpeed is in km/h
	const [simulationSpeed, setSimulationSpeed] = useState(60);
	const [isReturnJourney, setIsReturnJourney] = useState(false);
	const simulationIntervalRef = useRef({ frameId: null });
	const routeCoordsRef = useRef([]);
	const stopsCacheRef = useRef({}); // cache for stops by journey (busId + isReturnJourney)
	const lastFirestoreUpdateRef = useRef(0);
	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const busMarkerRef = useRef(null);
	const routeSourceId = "route";

	// ------------------- HELPER FUNCTIONS -------------------
	const calculateDistance = useCallback((pos1, pos2) => {
		const R = 6371; // km
		const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
		const dLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos((pos1.lat * Math.PI) / 180) *
				Math.cos((pos2.lat * Math.PI) / 180) *
				Math.sin(dLng / 2) ** 2;
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}, []);

	const formatDuration = useCallback((seconds) => {
		if (seconds == null || isNaN(seconds)) return "N/A";
		const mins = Math.round(seconds / 60);
		if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
	}, []);

	const getJourneyStatus = useCallback(() => {
		if (!stops.length) return bus?.status?.current || "Not Started";
		if (currentStopIndex === 0) return `Ongoing to ${stops[0].name}`;
		if (currentStopIndex >= stops.length)
			return isReturnJourney
				? `Reached ${stops[stops.length - 1].name} (Return)`
				: `Reached ${stops[stops.length - 1].name}`;
		return `Reached ${stops[currentStopIndex - 1]?.name}`;
	}, [stops, bus, currentStopIndex, isReturnJourney]);

	// ------------------- FETCH BUS -------------------
	// Fetch bus and stops, cache stops per journey direction
	useEffect(() => {
		if (!busId) return;
		setLoading(true);
		setError("");
		let unsubBus = null;
		const cacheKey = `${busId}-${isReturnJourney ? "return" : "forward"}`;
		const fetchStops = async (busData) => {
			if (stopsCacheRef.current[cacheKey]) {
				setStops(stopsCacheRef.current[cacheKey]);
				return;
			}
			const journeyStops = isReturnJourney ? busData.stopsReturn : busData.stops;
			if (journeyStops && Array.isArray(journeyStops)) {
				const stopDocsSnap = await Promise.all(
					journeyStops.map(async (s, idx) => {
						// Use stopRef instead of stopId to query stop documents
						const stopDoc = await getDoc(doc(db, "stops", s.stopRef));
						const stopData = stopDoc.exists() ? stopDoc.data() : {};
						if (!stopDoc.exists()) {
							console.warn(`Stop not found for ref: ${s.stopRef}`);
						}
						return {
							id: s.stopRef, // Use stopRef as id
							name: stopData.stopName || "Unknown Stop",
							lat: stopData.lat || 0,
							lng: stopData.lng || 0,
							stopNo: idx + 1,
							time: s.stopTime,
						};
					})
				);
				stopsCacheRef.current[cacheKey] = stopDocsSnap;
				setStops(stopDocsSnap);
			} else {
				setStops([]);
			}
		};
		unsubBus = onSnapshot(
			doc(db, "buses", busId),
			async (docSnap) => {
				if (docSnap.exists()) {
					const busData = docSnap.data();
					setBus(busData);
					await fetchStops(busData);
					setLoading(false);
				} else {
					setError("Bus not found");
					setLoading(false);
				}
			},
			(err) => {
				console.error(err);
				setError("Failed to load bus data");
				setLoading(false);
			}
		);
		return () => {
			if (unsubBus) unsubBus();
		};
		// only refetch if busId or isReturnJourney changes
	}, [busId, isReturnJourney]);

	// ------------------- TRACKER DATA FETCH -------------------
	// Fetch driver location from tracker collection
	useEffect(() => {
		if (!busId) return;
		
		const unsubTracker = onSnapshot(
			doc(db, "tracker", busId),
			(docSnap) => {
				if (docSnap.exists()) {
					const trackerData = docSnap.data();
					
					// Extract location from GeoJSON Point format
					if (trackerData.location && 
						trackerData.location.type === "Point" && 
						trackerData.location.coordinates && 
						trackerData.location.coordinates.length === 2) {
						
						const [lng, lat] = trackerData.location.coordinates;
						
						// Validate coordinates
						if (typeof lat === "number" && typeof lng === "number" && 
							!isNaN(lat) && !isNaN(lng)) {
							
							setDriverLocation({ lat, lng });
							
							// Convert timestamp to Date
							if (trackerData.timestamp) {
								const timestamp = trackerData.timestamp.toDate ? 
									trackerData.timestamp.toDate() : 
									new Date(trackerData.timestamp);
								setLastUpdated(timestamp);
							} else {
								setLastUpdated(new Date());
							}
						} else {
							setDriverLocation(null);
						}
					} else {
						setDriverLocation(null);
					}
				} else {
					// No tracker data available
					setDriverLocation(null);
				}
			},
			(err) => {
				console.error("Error fetching tracker data:", err);
				setDriverLocation(null);
			}
		);

		return () => {
			unsubTracker();
		};
	}, [busId]);

	// ------------------- DRIVER LOCATION / ETA -------------------
	// Will on this when wants to use real data
	// useEffect(() => {
	// 	let watchId;
	// 	if ("geolocation" in navigator) {
	// 		watchId = navigator.geolocation.watchPosition(
	// 			(pos) => {
	// 				const newLocation = {
	// 					lat: pos.coords.latitude,
	// 					lng: pos.coords.longitude,
	// 				};
	// 				console.log("Driver location updated:", newLocation);
	// 				setDriverLocation(newLocation);
	// 				setLastUpdated(new Date());

	// 				if (stops.length > currentStopIndex) {
	// 					const nextStop = stops[currentStopIndex];
	// 					const finalStop = stops[stops.length - 1];
	// 					const avgSpeed = 30 * simulationSpeed;
	// 					setEtaNextStop(
	// 						Math.round(
	// 							(calculateDistance(newLocation, nextStop) /
	// 								avgSpeed) *
	// 								3600
	// 						)
	// 					);
	// 					setEtaFinalStop(
	// 						Math.round(
	// 							(calculateDistance(newLocation, finalStop) /
	// 								avgSpeed) *
	// 								3600
	// 						)
	// 					);
	// 					const now = new Date();
	// 					const scheduledTime = new Date(
	// 						`${now.toDateString()} ${nextStop.time}`
	// 					);
	// 					setDelayed(now > scheduledTime);
	// 				}

	// 				if (stops.length > 0 && currentStopIndex < stops.length) {
	// 					const nextStop = stops[currentStopIndex];
	// 					const dist = calculateDistance(newLocation, nextStop);
	// 					if (dist < 0.05)
	// 						setCurrentStopIndex((prev) =>
	// 							Math.min(prev + 1, stops.length - 1)
	// 						);
	// 				}
	// 			},
	// 			(err) => console.warn(err.message),
	// 			{ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
	// 		);
	// 	}
	// 	return () => watchId && navigator.geolocation.clearWatch(watchId);
	// }, [stops, currentStopIndex, simulationSpeed]);

	// ------------------- MAP -------------------
	// ----------- MAP: Setup, Route, and Markers Separation -----------
	// Mapbox map initialization (once)
	useEffect(() => {
		if (!mapContainer.current || mapRef.current) return;
		const initialCenter =
			stops.length > 0
				? [stops[stops.length - 1].lng, stops[stops.length - 1].lat]
				: [77.5946, 12.9716];
		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center: initialCenter,
			zoom: 12,
		});
		mapRef.current.on("load", () => {
			updateMapRoute();
			updateMapMarkers();
		});
	}, [mapContainer.current]);

	// Memoized valid coordinates for route/stops
	const validCoords = useMemo(
		() =>
			stops
				.map((s) => [s.lng, s.lat])
				.filter(
					([lng, lat]) =>
						lng != null && lat != null && lng !== 0 && lat !== 0
				),
		[stops]
	);

	// Draw route on map
	const updateMapRoute = useCallback(async () => {
		if (!mapRef.current || stops.length === 0 || !bus) return;
		if (!mapRef.current.isStyleLoaded()) return;
		if (validCoords.length < 2) return;
		const coordsStr = validCoords.map((c) => c.join(",")).join(";");
		try {
			const res = await fetch(
				`https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
			);
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			const data = await res.json();
			if (data.routes && data.routes[0]) {
				const route = data.routes[0].geometry;
				if (mapRef.current.getLayer(routeSourceId)) {
					mapRef.current.removeLayer(routeSourceId);
				}
				if (mapRef.current.getSource(routeSourceId)) {
					mapRef.current.removeSource(routeSourceId);
				}
				mapRef.current.addSource(routeSourceId, {
					type: "geojson",
					data: { type: "Feature", properties: {}, geometry: route },
				});
				mapRef.current.addLayer({
					id: routeSourceId,
					type: "line",
					source: routeSourceId,
					layout: { "line-join": "round", "line-cap": "round" },
					paint: {
						"line-color": "#3B82F6",
						"line-width": 4,
						"line-opacity": 0.8,
					},
				});
			}
		} catch (err) {
			console.error("Error fetching route from Mapbox:", err);
		}
		const bounds = new mapboxgl.LngLatBounds();
		validCoords.forEach((c) => bounds.extend(c));
		mapRef.current.fitBounds(bounds, { padding: 50 });
	}, [stops, bus, validCoords]);

	// Draw/Update stop markers and bus marker
	const updateMapMarkers = useCallback(() => {
		if (!mapRef.current || stops.length === 0) return;
		// Remove old stop markers
		if (markersRef.current && markersRef.current.length > 0) {
			markersRef.current.forEach((m) => m.remove());
			markersRef.current = [];
		}
		// Add new stop markers
		stops.forEach((stop, idx) => {
			let color =
				idx < currentStopIndex
					? "#888888"
					: idx === currentStopIndex
					? "#3B82F6"
					: "#22C55E";
			const marker = new mapboxgl.Marker({ color })
				.setLngLat([stop.lng, stop.lat])
				.addTo(mapRef.current);
			markersRef.current.push(marker);
		});
		// Update bus marker
		if (driverLocation) {
			if (!busMarkerRef.current) {
				busMarkerRef.current = new mapboxgl.Marker({ color: "#FFD700" })
					.setLngLat([driverLocation.lng, driverLocation.lat])
					.addTo(mapRef.current);
			} else {
				busMarkerRef.current.setLngLat([
					driverLocation.lng,
					driverLocation.lat,
				]);
			}
		}
	}, [stops, currentStopIndex, driverLocation]);

	// Redraw route when stops change and map is loaded
	useEffect(() => {
		if (mapRef.current && mapRef.current.isStyleLoaded()) {
			updateMapRoute();
		}
		// Only when stops change
	}, [stops, updateMapRoute]);

	// Update markers when driver location, stop index, or stops change
	useEffect(() => {
		if (mapRef.current && mapRef.current.isStyleLoaded()) {
			updateMapMarkers();
		}
	}, [driverLocation, currentStopIndex, isJourneyStarted, stops, updateMapMarkers]);

	// Cleanup map on unmount
	useEffect(() => {
		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
			if (busMarkerRef.current) {
				busMarkerRef.current.remove();
				busMarkerRef.current = null;
			}
		};
	}, []);

	// ------------------- SIMULATION -------------------
	// Modified simulation to pause at each stop and resume with Resume Journey
	const startJourney = useCallback(() => {
		if (stops.length < 2) return;
		setIsJourneyStarted(true);
		setIsJourneyPaused(false);
		let routeCoords = routeCoordsRef.current;
		if (!routeCoords || routeCoords.length === 0) return;
		let coordIndex = simulationIntervalRef.current.coordIndex ?? 0;
		let stopIdx = simulationIntervalRef.current.stopIdx ?? currentStopIndex;
		// If we're starting anew, find the closest coord to current driver location or stop
		if (
			simulationIntervalRef.current.coordIndex == null ||
			simulationIntervalRef.current.stopIdx == null ||
			!isJourneyPaused
		) {
			const getClosestCoordIndex = () => {
				const target = driverLocation
					? [driverLocation.lng, driverLocation.lat]
					: [stops[stopIdx].lng, stops[stopIdx].lat];
				let minDist = Infinity;
				let minIdx = 0;
				routeCoords.forEach((c, i) => {
					const d = Math.sqrt((c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2);
					if (d < minDist) {
						minDist = d;
						minIdx = i;
					}
				});
				return minIdx;
			};
			coordIndex = getClosestCoordIndex();
			stopIdx = currentStopIndex;
		}
		simulationIntervalRef.current.coordIndex = coordIndex;
		simulationIntervalRef.current.stopIdx = stopIdx;
		let lastWrite = 0;
		const animate = () => {
			// Always reference coordIndex and stopIdx from simulationIntervalRef
			coordIndex = simulationIntervalRef.current.coordIndex ?? 0;
			stopIdx = simulationIntervalRef.current.stopIdx ?? currentStopIndex;
			if (isJourneyPaused) {
				simulationIntervalRef.current.frameId = null;
				return;
			}
			if (coordIndex >= routeCoords.length) {
				setCurrentStopIndex(stops.length);
				setDriverLocation({
					lat: stops[stops.length - 1].lat,
					lng: stops[stops.length - 1].lng,
				});
				return;
			}
			const coord = routeCoords[coordIndex];
			setDriverLocation({ lat: coord[1], lng: coord[0] });
			// Check if reached next stop
			if (
				stopIdx < stops.length &&
				Math.abs(coord[0] - stops[stopIdx].lng) < 0.0002 &&
				Math.abs(coord[1] - stops[stopIdx].lat) < 0.0002
			) {
				setCurrentStopIndex(stopIdx + 1);
				stopIdx++;
				simulationIntervalRef.current.stopIdx = stopIdx;
				setIsJourneyPaused(true);
				simulationIntervalRef.current.frameId = null;
				return;
			}
			const nextCoord = routeCoords[coordIndex + 1];
			if (!nextCoord) return;
			const distanceKm = calculateDistance(
				{ lat: coord[1], lng: coord[0] },
				{ lat: nextCoord[1], lng: nextCoord[0] }
			);
			const speed = simulationSpeed;
			const timeMs = (distanceKm / speed) * 3600 * 1000;
			coordIndex += 1;
			simulationIntervalRef.current.coordIndex = coordIndex;
			// Use requestAnimationFrame for smooth movement, throttle updates
			const now = Date.now();
			if (now - lastWrite > 350) {
				lastWrite = now;
			}
			simulationIntervalRef.current.frameId = window.requestAnimationFrame(animate);
		};
		if (simulationIntervalRef.current.frameId) {
			window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
		}
		simulationIntervalRef.current.frameId = window.requestAnimationFrame(animate);
	}, [stops, currentStopIndex, driverLocation, simulationSpeed, calculateDistance, isJourneyPaused]);

	// Resume journey from where it was paused (at a stop)
	useEffect(() => {
		if (
			isJourneyStarted &&
			!isJourneyPaused &&
			currentStopIndex < stops.length
		) {
			let routeCoords = routeCoordsRef.current;
			// Use persisted coordIndex and stopIdx
			let coordIndex = simulationIntervalRef.current.coordIndex ?? 0;
			let stopIdx = simulationIntervalRef.current.stopIdx ?? currentStopIndex;
			const animate = () => {
				coordIndex = simulationIntervalRef.current.coordIndex ?? 0;
				stopIdx = simulationIntervalRef.current.stopIdx ?? currentStopIndex;
				if (isJourneyPaused) {
					simulationIntervalRef.current.frameId = null;
					return;
				}
				if (coordIndex >= routeCoords.length) {
					setCurrentStopIndex(stops.length);
					setDriverLocation({
						lat: stops[stops.length - 1].lat,
						lng: stops[stops.length - 1].lng,
					});
					return;
				}
				const coord = routeCoords[coordIndex];
				setDriverLocation({ lat: coord[1], lng: coord[0] });
				if (
					stopIdx < stops.length &&
					Math.abs(coord[0] - stops[stopIdx].lng) < 0.0002 &&
					Math.abs(coord[1] - stops[stopIdx].lat) < 0.0002
				) {
					setCurrentStopIndex(stopIdx + 1);
					stopIdx++;
					simulationIntervalRef.current.stopIdx = stopIdx;
					setIsJourneyPaused(true);
					simulationIntervalRef.current.frameId = null;
					return;
				}
				const nextCoord = routeCoords[coordIndex + 1];
				if (!nextCoord) return;
				const distanceKm = calculateDistance(
					{ lat: coord[1], lng: coord[0] },
					{ lat: nextCoord[1], lng: nextCoord[0] }
				);
				const speed = simulationSpeed;
				const timeMs = (distanceKm / speed) * 3600 * 1000;
				coordIndex += 1;
				simulationIntervalRef.current.coordIndex = coordIndex;
				simulationIntervalRef.current.frameId = window.requestAnimationFrame(animate);
			};
			if (simulationIntervalRef.current.frameId) {
				window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
			}
			simulationIntervalRef.current.frameId = window.requestAnimationFrame(animate);
		}
		return () => {
			if (simulationIntervalRef.current.frameId) {
				window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
				simulationIntervalRef.current.frameId = null;
			}
		};
	}, [isJourneyStarted, isJourneyPaused, currentStopIndex, stops, simulationSpeed, calculateDistance]);
	// Fetch and cache Mapbox route coordinates when stops change, and update route layer once
	// Fetch and cache Mapbox route coordinates when stops change
	useEffect(() => {
		let ignore = false;
		const fetchRouteCoords = async () => {
			routeCoordsRef.current = [];
			if (!stops || stops.length < 2) return;
			const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
			try {
				const res = await fetch(
					`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
				);
				if (!res.ok) throw new Error("Failed to fetch directions");
				const data = await res.json();
				if (
					data.routes &&
					data.routes[0] &&
					data.routes[0].geometry &&
					data.routes[0].geometry.coordinates
				) {
					if (!ignore) {
						routeCoordsRef.current =
							data.routes[0].geometry.coordinates;
					}
				}
			} catch (err) {
				console.error("Error fetching route coordinates:", err);
				routeCoordsRef.current = [];
			}
		};
		fetchRouteCoords();
		return () => {
			ignore = true;
		};
	}, [stops]);

	// driverLocation is now managed by tracker listener

	const toggleJourneyPause = useCallback(() => setIsJourneyPaused((prev) => !prev), []);
	// Cancel animation frame if journey stopped/unmounted
	useEffect(() => {
		return () => {
			if (simulationIntervalRef.current.frameId) {
				window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
				simulationIntervalRef.current.frameId = null;
			}
		};
	}, []);

	const changeCapacity = useCallback(async (delta) => {
		if (!bus) return;
		const newLoad = Math.min(
			Math.max((bus.currLoad || 0) + delta, 0),
			bus.capacity
		);
		await updateDoc(doc(db, "buses", busId), { currLoad: newLoad });
	}, [bus, busId]);

	// Mark stop reached (not used in UI, but keep for possible future use)
	const markStopReached = useCallback((stopIndex) => {
		setDriverLocation({
			lat: stops[stopIndex].lat,
			lng: stops[stopIndex].lng,
		});
		setCurrentStopIndex(stopIndex + 1);
	}, [stops]);

	const journeyPercent = useMemo(() =>
		stops.length > 1
			? Math.min(
					Math.max(
						Math.round(
							((currentStopIndex - 1) / (stops.length - 1)) * 100
						),
						0
					),
					100
			  )
			: 0
	, [stops, currentStopIndex]);
	// ---- ETA calculation ----
	useEffect(() => {
		// Compute ETA for next stop and final stop
		if (!driverLocation || stops.length === 0 || currentStopIndex >= stops.length) {
			setEtaNextStop(null);
			setEtaFinalStop(null);
			return;
		}
		const speed = simulationSpeed > 0 ? simulationSpeed : 60;
		let nextStop = stops[currentStopIndex];
		let finalStop = stops[stops.length - 1];
		const distToNext = calculateDistance(driverLocation, nextStop);
		const distToFinal = calculateDistance(driverLocation, finalStop);
		setEtaNextStop(Math.round((distToNext / speed) * 3600));
		setEtaFinalStop(Math.round((distToFinal / speed) * 3600));
		const now = new Date();
		const scheduledTime = new Date(`${now.toDateString()} ${nextStop.time}`);
		setDelayed(now > scheduledTime);
	}, [driverLocation, stops, currentStopIndex, simulationSpeed, calculateDistance]);

	// ---- Firestore real-time update ----
	// Throttle Firestore writes (tracker data and bus status)
	useEffect(() => {
		if (!busId) return;
		let isUnmounted = false;
		const updateFirestore = async () => {
			if (
				driverLocation &&
				stops.length > 0 &&
				currentStopIndex <= stops.length
			) {
				const now = Date.now();
				if (now - lastFirestoreUpdateRef.current < 1800) return; // throttle to once every ~1.8s
				lastFirestoreUpdateRef.current = now;
				
				// Update tracker collection with driver location
				const trackerRef = doc(db, "tracker", busId);
				await setDoc(trackerRef, {
					busId,
					location: { 
						type: "Point", 
						coordinates: [driverLocation.lng, driverLocation.lat] 
					},
					speed: simulationSpeed,
					timestamp: serverTimestamp()
				}, { merge: true });

				// Update bus document with journey status (no location data)
				const busRef = doc(db, "buses", busId);
				let startTimeVal = bus?.startTime;
				let endTimeVal = bus?.endTime;
				if (stops.length > 0) {
					startTimeVal = stops[0]?.time || "";
					endTimeVal = stops[stops.length - 1]?.time || "";
				}
				await updateDoc(busRef, {
					"status.currentStopIndex": currentStopIndex,
					startTime: startTimeVal,
					endTime: endTimeVal,
				});
				
				if (!isUnmounted) setLastUpdated(new Date());
			}
		};
		const interval = setInterval(updateFirestore, 2000);
		return () => {
			isUnmounted = true;
			clearInterval(interval);
		};
		// Only rerun if these change
	}, [driverLocation, currentStopIndex, stops, busId, bus, simulationSpeed]);

	// ---- Restart Journey ----
	const handleRestartJourney = useCallback(() => {
		setIsJourneyStarted(false);
		setIsJourneyPaused(false);
		setCurrentStopIndex(0);
		// driverLocation will be set by tracker listener
		if (simulationIntervalRef.current.frameId) {
			window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
			simulationIntervalRef.current.frameId = null;
		}
	}, [stops]);

	const handleReturnJourney = useCallback(() => {
		setIsReturnJourney(true);
		// stops will be set by useEffect on busId/isReturnJourney change
		setCurrentStopIndex(0);
		setIsJourneyStarted(false);
		setIsJourneyPaused(false);
		// driverLocation will be set by useEffect on stops change
		if (simulationIntervalRef.current.frameId) {
			window.cancelAnimationFrame(simulationIntervalRef.current.frameId);
			simulationIntervalRef.current.frameId = null;
		}
	}, []);

	// ------------------- RENDER -------------------
	if (loading) return <div className="p-8">Loading...</div>;
	if (error) return <div className="p-8 text-red-600">{error}</div>;
	if (!bus) return <div className="p-8 text-gray-500">No bus data found</div>;


	return (
		<>
			<div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
				{/* Header */}
				<div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-4">
							<div>
								<h2 className="text-2xl font-bold">
									{bus.busName}
								</h2>
								<p className="text-blue-100">
									Bus No: {bus.busNo}
								</p>
							</div>
							<span
								className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
									currentStopIndex === 0
										? "bg-green-500 text-white"
										: currentStopIndex >= stops.length
										? "bg-gray-500 text-white"
										: "bg-yellow-500 text-gray-900"
								}`}>
								{getJourneyStatus()}
							</span>
						</div>
						<div className="flex items-center space-x-3">
							<button
								onClick={() => {
									if (!isJourneyStarted) startJourney();
									else toggleJourneyPause();
								}}
								className="px-4 py-2 bg-green-600 text-white rounded cursor-pointer">
								{!isJourneyStarted
									? "Start Journey"
									: isJourneyPaused
									? "Resume Journey"
									: currentStopIndex >= stops.length
									? "Journey Completed"
									: `Ongoing to ${
											stops[currentStopIndex]?.name ||
											"Next Stop"
									  }`}
							</button>
							<select
								value={simulationSpeed}
								onChange={(e) =>
									setSimulationSpeed(Number(e.target.value))
								}
								className="border rounded px-2 py-1"
								title="Driver speed (km/h)">
								{[60, 120, 180, 240, 300].map((speed) => (
									<option key={speed} value={speed}>
										{speed} km/h
									</option>
								))}
							</select>
							<button
								onClick={handleRestartJourney}
								className="px-3 py-2 bg-yellow-500 text-white rounded ml-2"
								disabled={stops.length === 0}>
								Restart Journey
							</button>
							{currentStopIndex >= stops.length && !isReturnJourney && (
								<button
									onClick={handleReturnJourney}
									className="px-3 py-2 bg-blue-500 text-white rounded ml-2">
									Start Return Journey
								</button>
							)}
						</div>
						{/* edit btn
						<button
							onClick={handleEditBus}
							className="flex items-center space-x-2 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors duration-200 text-black">
							<FaEdit className="w-4 h-4" />
							Edit
						</button> */}
					</div>
				</div>

				{/* Main Content */}
				<div className="p-6">
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						{/* Left Panel - Driver & Capacity */}
						<div className="space-y-6">
							{/* Driver Info */}
							<div className="bg-gray-50 rounded-lg p-4">
								<h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
									<Users className="w-5 h-5 mr-2" />
									Driver Info
								</h3>
								<div className="space-y-2">
									<p>
										<span className="font-medium">
											Name:
										</span>{" "}
										{bus.driverName || "Not Assigned"}
									</p>
									<p>
										<span className="font-medium">
											Contact:
										</span>{" "}
										{bus.driverContact || "N/A"}
									</p>
								</div>
							</div>

							{/* Capacity */}
							<div className="bg-gray-50 rounded-lg p-4">
								<h3 className="text-lg font-semibold text-gray-800 mb-3">
									Capacity Management
								</h3>
								<div className="space-y-3">
									<div className="flex justify-between items-center text-sm">
										<span>Current Load</span>
										<span className="font-bold">
											{bus.currLoad || 0} / {bus.capacity}
										</span>
									</div>
									<div className="relative w-full bg-gray-200 rounded-full h-6 overflow-hidden">
										<div
											className={`h-6 transition-all duration-300 ${
												(bus.currLoad || 0) /
													bus.capacity >
												0.8
													? "bg-red-500"
													: (bus.currLoad || 0) /
															bus.capacity >
													  0.6
													? "bg-yellow-500"
													: "bg-green-500"
											}`}
											style={{
												width: `${
													((bus.currLoad || 0) /
														bus.capacity) *
													100
												}%`,
											}}
										/>
										<div className="absolute inset-0 flex justify-between items-center px-2">
											<button
												onClick={() =>
													changeCapacity(-1)
												}
												className="w-5 h-5 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full flex items-center justify-center text-xs font-bold transition-colors">
												-
											</button>
											<button
												onClick={() =>
													changeCapacity(1)
												}
												className="w-5 h-5 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full flex items-center justify-center text-xs font-bold transition-colors">
												+
											</button>
										</div>
									</div>
								</div>
							</div>

							{/* Journey Times */}
							<div className="bg-gray-50 rounded-lg p-4">
								<h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
									<Clock className="w-5 h-5 mr-2" />
									Journey Times
								</h3>
								<div className="space-y-2 text-sm">
									<p>
										<span className="font-medium">
											Start:
										</span>{" "}
										{bus.startTime || "N/A"}
									</p>
									<p>
										<span className="font-medium">
											End:
										</span>{" "}
										{bus.endTime || "N/A"}
									</p>
									<p>
										<span className="font-medium">
											Last GPS:
										</span>{" "}
										{lastUpdated
											? lastUpdated.toLocaleTimeString()
											: "N/A"}
									</p>
								</div>
							</div>
						</div>

						{/* Middle Panel - Stops & ETA */}
						<div className="space-y-4">
							<div className="bg-gray-50 rounded-lg p-4">
								<h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
									<Navigation className="w-5 h-5 mr-2" />
									Stops & ETA
								</h3>
								<div className="max-h-80 overflow-y-auto space-y-2">
									{stops.map((stop, idx) => (
										<div
											key={stop.id}
											className={`flex justify-between items-center p-3 rounded-lg transition-colors ${
												idx === currentStopIndex
													? "bg-blue-100 border-l-4 border-blue-500"
													: idx < currentStopIndex
													? "bg-gray-100 opacity-75"
													: "bg-white border border-gray-200"
											}`}>
											<div className="flex items-center space-x-3">
												<div
													className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
														idx < currentStopIndex
															? "bg-gray-400"
															: idx ===
															  currentStopIndex
															? "bg-blue-500"
															: "bg-green-500"
													}`}>
													{idx + 1}
												</div>
												<div>
													<p className="font-medium text-sm">
														{stop.name}
													</p>
													<p className="text-xs text-gray-600">
														Scheduled: {stop.time}
													</p>
												</div>
											</div>
											{idx === currentStopIndex &&
												etaNextStop != null && (
													<div className="text-right">
														<p
															className={`text-xs font-bold ${
																delayed
																	? "text-red-600"
																	: "text-green-700"
															}`}>
															ETA:{" "}
															{formatDuration(
																etaNextStop
															)}
															{delayed && " ⚠️"}
														</p>
													</div>
												)}
										</div>
									))}
								</div>
							</div>

							{/* Journey Progress */}
							<div className="bg-gray-50 rounded-lg p-4">
								<div className="flex justify-between items-center mb-2">
									<span className="text-sm font-medium">
										Journey Progress
									</span>
									<span className="text-sm text-gray-600">
										{journeyPercent}%
									</span>
								</div>
								<div className="w-full bg-gray-200 rounded-full h-3">
									<div
										className="h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
										style={{
											width: `${journeyPercent}%`,
										}}
									/>
								</div>
							</div>

							{/* ETA Summary */}
							<div className="bg-gray-50 rounded-lg p-4 space-y-2">
								<div className="flex justify-between">
									<span className="font-medium">
										Next Stop ETA:
									</span>
									<span
										className={`${
											delayed
												? "text-red-600 font-bold"
												: "text-green-700"
										}`}>
										{formatDuration(etaNextStop)}{" "}
										{delayed && "⚠️"}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="font-medium">
										Final Destination ETA:
									</span>
									<span>{formatDuration(etaFinalStop)}</span>
								</div>
							</div>
						</div>

						{/* Right Panel - Map */}
						<div className="bg-gray-50 rounded-lg overflow-hidden">
							<div className="h-96">
								<div
									ref={mapContainer}
									className="w-full h-full"
									aria-label="Bus route map"
								/>
							</div>
							<div className="p-4 bg-white border-t">
								<div className="flex items-center justify-between text-sm">
									<div className="flex items-center space-x-2">
										<div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
										<span>Bus Location</span>
									</div>
									<div className="flex items-center space-x-4">
										<div className="flex items-center space-x-2">
											<div className="w-3 h-3 bg-gray-400 rounded-full"></div>
											<span>Completed</span>
										</div>
										<div className="flex items-center space-x-2">
											<div className="w-3 h-3 bg-blue-500 rounded-full"></div>
											<span>Current</span>
										</div>
										<div className="flex items-center space-x-2">
											<div className="w-3 h-3 bg-green-500 rounded-full"></div>
											<span>Upcoming</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

export default AdminBusCard;
