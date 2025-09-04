import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Haversine formula to calculate distance between two lat/lng points in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
	function toRad(x) {
		return (x * Math.PI) / 180;
	}
	const R = 6371000; // meters
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

const BusInfo = ({ busId }) => {
	// State for bus doc and stops
	const [bus, setBus] = useState(null);
	const [stops, setStops] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Journey state
	const [currentStopIndex, setCurrentStopIndex] = useState(0);
	const [status, setStatus] = useState("Not Started");
	const [isReturn, setIsReturn] = useState(false);

	// Geolocation state
	const [driverLocation, setDriverLocation] = useState(null);
	const [lastUpdated, setLastUpdated] = useState(null);

	// Mapbox
	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const driverMarkerRef = useRef(null);

	// Fetch bus and stops with real-time updates
	useEffect(() => {
		if (!busId) return;

		setLoading(true);
		setError("");

		// Real-time listener for bus document
		const unsubscribe = onSnapshot(
			doc(db, "buses", busId),
			(docSnap) => {
				if (docSnap.exists()) {
					const busData = docSnap.data();
					setBus(busData);

					// Use stops from bus document directly
					if (busData.stops && Array.isArray(busData.stops)) {
						const processedStops = busData.stops.map(
							(stop, index) => ({
								id: stop.stopId || `stop_${index}`,
								name: stop.stopName,
								lat: stop.lat || 0,
								lng: stop.lng || 0,
								time: stop.stopTime,
								stopNo: stop.stopNo || index + 1,
								...stop,
							})
						);
						setStops(processedStops);
					} else {
						setStops([]);
					}
					setLoading(false);
				} else {
					setError("Bus not found");
					setLoading(false);
				}
			},
			(error) => {
				console.error("Error fetching bus:", error);
				setError("Failed to load bus data");
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, [busId]);

	// Initialize map
	useEffect(() => {
		if (!stops.length || !mapContainer.current || loading) return;

		// Clean up existing map
		if (mapRef.current) {
			mapRef.current.remove();
		}

		// Clean up existing markers
		markersRef.current.forEach((marker) => marker.remove());
		markersRef.current = [];
		if (driverMarkerRef.current) {
			driverMarkerRef.current.remove();
			driverMarkerRef.current = null;
		}

		// Set mapbox token
		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

		if (!mapboxgl.accessToken) {
			setError("Mapbox token not configured");
			return;
		}

		// Calculate map center and bounds
		const validStops = stops.filter((stop) => stop.lat && stop.lng);
		if (validStops.length === 0) {
			setError("No valid stop coordinates found");
			return;
		}

		const center =
			validStops.length > 0
				? [validStops[0].lng, validStops[0].lat]
				: [77.209, 28.6139]; // Default to Delhi

		// Initialize map
		mapRef.current = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center,
			zoom: 12,
		});

		mapRef.current.on("load", () => {
			// Add route line if we have multiple stops
			if (validStops.length > 1) {
				mapRef.current.addSource("route", {
					type: "geojson",
					data: {
						type: "Feature",
						properties: {},
						geometry: {
							type: "LineString",
							coordinates: validStops.map((stop) => [
								stop.lng,
								stop.lat,
							]),
						},
					},
				});

				mapRef.current.addLayer({
					id: "route",
					type: "line",
					source: "route",
					layout: { "line-join": "round", "line-cap": "round" },
					paint: { "line-color": "#0074D9", "line-width": 4 },
				});
			}

			// Add stop markers
			validStops.forEach((stop, idx) => {
				const isCurrentStop = idx === currentStopIndex;
				const isPastStop = idx < currentStopIndex;

				let markerColor = "#2ECC40"; // Green for upcoming stops
				if (isCurrentStop) markerColor = "#FF4136"; // Red for current
				if (isPastStop) markerColor = "#AAAAAA"; // Gray for completed

				const marker = new mapboxgl.Marker({ color: markerColor })
					.setLngLat([stop.lng, stop.lat])
					.setPopup(
						new mapboxgl.Popup().setHTML(`
                            <div>
                                <strong>${stop.name}</strong><br/>
                                Stop ${stop.stopNo}<br/>
                                Time: ${stop.time}
                            </div>
                        `)
					)
					.addTo(mapRef.current);

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
	}, [stops, loading, currentStopIndex]);

	// Update driver location on map
	useEffect(() => {
		if (!driverLocation || !mapRef.current) return;

		// Remove existing driver marker
		if (driverMarkerRef.current) {
			driverMarkerRef.current.remove();
		}

		// Add new driver marker
		const driverMarker = new mapboxgl.Marker({
			color: "#FFD700", // Gold color for driver
			scale: 1.2,
		})
			.setLngLat([driverLocation.lng, driverLocation.lat])
			.setPopup(
				new mapboxgl.Popup().setHTML(`
                    <div>
                        <strong>Driver Location</strong><br/>
                        Updated: ${
							lastUpdated
								? lastUpdated.toLocaleTimeString()
								: "Unknown"
						}
                    </div>
                `)
			)
			.addTo(mapRef.current);

		driverMarkerRef.current = driverMarker;

		// Center map on driver location
		mapRef.current.easeTo({
			center: [driverLocation.lng, driverLocation.lat],
			zoom: 15,
		});
	}, [driverLocation, lastUpdated]);

	// Watch driver geolocation
	useEffect(() => {
		let watchId;

		if ("geolocation" in navigator) {
			watchId = navigator.geolocation.watchPosition(
				(pos) => {
					const newLocation = {
						lat: pos.coords.latitude,
						lng: pos.coords.longitude,
					};
					setDriverLocation(newLocation);
					setLastUpdated(new Date());
				},
				(err) => {
					console.warn("Geolocation error:", err.message);
				},
				{
					enableHighAccuracy: true,
					maximumAge: 10000,
					timeout: 20000,
				}
			);
		}

		return () => {
			if (watchId) {
				navigator.geolocation.clearWatch(watchId);
			}
		};
	}, []);

	// Auto-mark stop as reached if within threshold (100 meters)
	useEffect(() => {
		if (
			!driverLocation ||
			!stops.length ||
			currentStopIndex >= stops.length ||
			status === "Completed" ||
			status === "Return Completed"
		)
			return;

		const currentStop = stops[currentStopIndex];
		if (!currentStop?.lat || !currentStop?.lng) return;

		const dist = haversineDistance(
			driverLocation.lat,
			driverLocation.lng,
			currentStop.lat,
			currentStop.lng
		);

		if (dist < 100 && status === "Ongoing") {
			setStatus("Reached");
		}
	}, [driverLocation, stops, currentStopIndex, status]);

	// Handler functions
	const handleStartJourney = () => {
		setStatus("Ongoing");
		setCurrentStopIndex(0);
		setIsReturn(false);
	};

	const handleReachStop = () => {
		if (currentStopIndex < stops.length - 1) {
			setCurrentStopIndex((prev) => prev + 1);
			setStatus("Ongoing");
		} else {
			setStatus("Completed");
		}
	};

	const handleStartReturnJourney = () => {
		setIsReturn(true);
		setStatus("Return Ongoing");
		setCurrentStopIndex(0);
		// Reverse the stops for return journey
		setStops((prev) => [...prev].reverse());
	};

	const handleReachReturnStop = () => {
		if (currentStopIndex < stops.length - 1) {
			setCurrentStopIndex((prev) => prev + 1);
			setStatus("Return Ongoing");
		} else {
			setStatus("Return Completed");
		}
	};

	// Loading state
	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center">Loading bus information...</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center text-red-600">{error}</div>
			</div>
		);
	}

	// No bus data
	if (!bus) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center">No bus data found</div>
			</div>
		);
	}

	// Compute journey status
	let journeyStatusLabel = "";
	const currentStopName = stops[currentStopIndex]?.name || "";
	const nextStopName = stops[currentStopIndex + 1]?.name || "";
	const endStopName = stops[stops.length - 1]?.name || "";

	switch (status) {
		case "Not Started":
			journeyStatusLabel = `Ready to start from ${stops[0]?.name || ""}`;
			break;
		case "Ongoing":
			journeyStatusLabel = `En route to ${nextStopName || endStopName}`;
			break;
		case "Reached":
			journeyStatusLabel = `Arrived at ${currentStopName}`;
			break;
		case "Completed":
			journeyStatusLabel = "Journey completed";
			break;
		case "Return Ongoing":
			journeyStatusLabel = `Return journey to ${
				nextStopName || endStopName
			}`;
			break;
		case "Return Completed":
			journeyStatusLabel = "Return journey completed";
			break;
		default:
			journeyStatusLabel = "Unknown status";
	}

	// Calculate ETA to next stop
	let ETA = "";
	if (
		driverLocation &&
		currentStopIndex < stops.length &&
		stops[currentStopIndex]
	) {
		const currentStop = stops[currentStopIndex];
		if (currentStop.lat && currentStop.lng) {
			const dist = haversineDistance(
				driverLocation.lat,
				driverLocation.lng,
				currentStop.lat,
				currentStop.lng
			);
			ETA = `${Math.round(dist)}m away`;
		}
	}

	const returnJourneyEnabled = bus.returnJourney?.enabled || false;

	return (
		<div className="border rounded-lg overflow-hidden shadow-lg bg-white text-black">
			<div className="flex">
				{/* Left panel: Bus Details */}
				<div className="flex flex-col gap-3 p-6 border-r min-w-[280px] bg-gray-50">
					<div className="border-b pb-3">
						<h2 className="text-2xl font-bold text-blue-600">
							{bus.busNo}
						</h2>
						<p className="text-lg font-medium text-gray-700">
							{bus.busName}
						</p>
					</div>

					<div className="space-y-2 text-sm">
						<p>
							<span className="font-medium">Driver:</span>{" "}
							{bus.driverName}
						</p>
						<p>
							<span className="font-medium">Capacity:</span>{" "}
							{bus.currLoad || 0} / {bus.capacity} passengers
						</p>
						<p>
							<span className="font-medium">Route:</span>{" "}
							{stops[0]?.name} → {endStopName}
						</p>
					</div>

					<div className="border-t pt-3 space-y-2 text-xs text-gray-600">
						<p>
							<span className="font-medium">Status:</span>{" "}
							{journeyStatusLabel}
						</p>
						<p>
							<span className="font-medium">Current Stop:</span>{" "}
							{currentStopName || "Not started"}
						</p>
						{ETA && (
							<p>
								<span className="font-medium">Distance:</span>{" "}
								{ETA}
							</p>
						)}
						<p>
							<span className="font-medium">Last Updated:</span>{" "}
							{lastUpdated
								? lastUpdated.toLocaleTimeString()
								: "No GPS signal"}
						</p>
					</div>
				</div>

				{/* Middle panel: Journey Controls */}
				<div className="flex flex-col items-center justify-center px-8 py-6 gap-4 min-w-[200px]">
					<div className="text-center">
						<div className="text-lg font-semibold mb-2">
							{status.replace(/([A-Z])/g, " $1").trim()}
						</div>
						<div className="text-sm text-gray-600">
							{journeyStatusLabel}
						</div>
					</div>

					<div className="space-y-3">
						{status === "Not Started" && (
							<button
								className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
								onClick={handleStartJourney}>
								Start Journey
							</button>
						)}

						{status === "Reached" && !isReturn && (
							<button
								className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
								onClick={handleReachStop}>
								Continue to Next Stop
							</button>
						)}

						{status === "Completed" &&
							returnJourneyEnabled &&
							!isReturn && (
								<button
									className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
									onClick={handleStartReturnJourney}>
									Start Return Journey
								</button>
							)}

						{status === "Reached" && isReturn && (
							<button
								className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
								onClick={handleReachReturnStop}>
								Continue Return Journey
							</button>
						)}
					</div>
				</div>

				{/* Right panel: Map */}
				<div
					className="flex-1 relative"
					style={{ minWidth: "400px", minHeight: "400px" }}>
					<div
						ref={mapContainer}
						className="w-full h-full"
						style={{ minHeight: "400px" }}
					/>

					{/* Map overlay with stop info */}
					<div className="absolute top-4 right-4 bg-white bg-opacity-95 p-3 rounded-lg shadow-md text-xs max-w-xs">
						<div className="space-y-1">
							<div>
								<strong>Next Stop:</strong>{" "}
								{nextStopName || endStopName || "None"}
							</div>
							{ETA && (
								<div>
									<strong>Distance:</strong> {ETA}
								</div>
							)}
							<div>
								<strong>Final Stop:</strong> {endStopName}
							</div>
							{driverLocation && (
								<div className="text-green-600">
									<strong>GPS:</strong> Active
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default BusInfo;
