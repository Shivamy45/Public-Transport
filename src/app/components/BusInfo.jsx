import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";


const BusInfo = ({ busId }) => {
	const [bus, setBus] = useState(null);
	const [stops, setStops] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState(false);
	const [driverLocation, setDriverLocation] = useState(null);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [etaNextStop, setEtaNextStop] = useState(null);
	const [etaFinalStop, setEtaFinalStop] = useState(null);
	const [delayed, setDelayed] = useState(false);

	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const busMarkerRef = useRef(null);
	const routeSourceId = "route";

	// Fetch bus and stops with real-time updates
	useEffect(() => {
		if (!busId) return;

		setLoading(true);
		setError("");

		const unsubscribe = onSnapshot(
			doc(db, "buses", busId),
			(docSnap) => {
				if (docSnap.exists()) {
					const busData = docSnap.data();
					setBus(busData);
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

	// Initialize map and update route & markers on changes
	useEffect(() => {
		if (!mapContainer.current || !bus || !stops.length) return;
		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!mapboxgl.accessToken) {
			setError("Mapbox token not configured");
			return;
		}

		// Initialize map if not exists
		if (!mapRef.current) {
			mapRef.current = new mapboxgl.Map({
				container: mapContainer.current,
				style: "mapbox://styles/mapbox/streets-v11",
				center: [stops[0].lng, stops[0].lat],
				zoom: 12,
			});
		}

		// Clear existing markers
		markersRef.current.forEach((m) => m.remove());
		markersRef.current = [];
		if (busMarkerRef.current) {
			busMarkerRef.current.remove();
			busMarkerRef.current = null;
		}

		// Add stop markers with color coding
		stops.forEach((stop, idx) => {
			const markerColor = "#2ECC40"; // Green for all stops
			const marker = new mapboxgl.Marker({ color: markerColor })
				.setLngLat([stop.lng, stop.lat])
				.setPopup(
					new mapboxgl.Popup({ offset: 25 }).setHTML(`
						<div class="text-sm font-semibold">${stop.name}</div>
						<div class="text-xs">Scheduled: ${stop.time || "N/A"}</div>
					`)
				)
				.addTo(mapRef.current);
			markersRef.current.push(marker);
		});

		// Add bus marker if driver location available
		if (driverLocation) {
			busMarkerRef.current = new mapboxgl.Marker({
				color: "#FFD700",
				scale: 1.2,
			})
				.setLngLat([driverLocation.lng, driverLocation.lat])
				.setPopup(
					new mapboxgl.Popup({ offset: 25 }).setHTML(`
						<div class="text-sm font-semibold">Bus Location</div>
						<div class="text-xs">Updated: ${
							lastUpdated
								? lastUpdated.toLocaleTimeString()
								: "Unknown"
						}</div>
					`)
				)
				.addTo(mapRef.current);
		}

		// Fit map bounds to stops and driver location
		const bounds = new mapboxgl.LngLatBounds();
		stops.forEach((stop) => bounds.extend([stop.lng, stop.lat]));
		if (driverLocation) bounds.extend([driverLocation.lng, driverLocation.lat]);
		mapRef.current.fitBounds(bounds, { padding: 50 });

	}, [bus, stops, driverLocation, lastUpdated]);

	// Fetch and draw route using Mapbox Directions API
	useEffect(() => {
		if (
			!mapRef.current ||
			!driverLocation ||
			!stops.length ||
			!process.env.NEXT_PUBLIC_MAPBOX_TOKEN
		)
			return;

		const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		const coords = [
			[driverLocation.lng, driverLocation.lat],
			...stops.map((s) => [s.lng, s.lat]),
		];
		const coordStr = coords.map((c) => c.join(",")).join(";");

		const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&access_token=${accessToken}&overview=full&steps=false`;

		fetch(url)
			.then((res) => res.json())
			.then((data) => {
				if (
					data.routes &&
					data.routes.length > 0 &&
					data.routes[0].geometry
				) {
					const route = data.routes[0].geometry;

					// Add or update route source and layer
					if (mapRef.current.getSource(routeSourceId)) {
						mapRef.current.getSource(routeSourceId).setData({
							type: "Feature",
							properties: {},
							geometry: route,
						});
					} else {
						mapRef.current.addSource(routeSourceId, {
							type: "geojson",
							data: {
								type: "Feature",
								properties: {},
								geometry: route,
							},
						});
						mapRef.current.addLayer({
							id: routeSourceId,
							type: "line",
							source: routeSourceId,
							layout: {
								"line-join": "round",
								"line-cap": "round",
							},
							paint: {
								"line-color": "#0074D9",
								"line-width": 5,
								"line-opacity": 0.8,
							},
						});
					}

					// Calculate ETA to next stop and final stop
					if (data.routes[0].duration) {
						const durationSeconds = data.routes[0].duration;
						// Calculate ETA for next stop (first stop in stops list)
						if (stops.length > 0) {
							const nextStopDuration = data.routes[0].legs[0]?.duration || durationSeconds;
							setEtaNextStop(nextStopDuration);
							// Check delay against scheduled time for next stop
							const nextStopScheduled = stops[0]?.time;
							if (nextStopScheduled) {
								const now = new Date();
								const scheduledTime = new Date();
								const parts = nextStopScheduled.split(":");
								if (parts.length >= 2) {
									scheduledTime.setHours(parseInt(parts[0], 10));
									scheduledTime.setMinutes(parseInt(parts[1], 10));
									scheduledTime.setSeconds(0);
									const etaTime = new Date(now.getTime() + nextStopDuration * 1000);
									setDelayed(etaTime > scheduledTime);
								} else {
									setDelayed(false);
								}
							} else {
								setDelayed(false);
							}
						}
						// ETA to final stop (last leg)
						if (data.routes[0].legs.length > 1) {
							const finalLegDuration = data.routes[0].legs.reduce(
								(sum, leg) => sum + leg.duration,
								0
							);
							setEtaFinalStop(finalLegDuration);
						} else {
							setEtaFinalStop(durationSeconds);
						}
					}
				}
			})
			.catch(() => {
				setEtaNextStop(null);
				setEtaFinalStop(null);
				setDelayed(false);
			});
	}, [driverLocation, stops]);

	// Format duration seconds to human readable ETA
	const formatDuration = (seconds) => {
		if (seconds == null) return "";
		const mins = Math.round(seconds / 60);
		if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
	};

	if (loading) {
		return (
			<div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg border border-gray-200 p-6 animate-pulse">
				<div className="flex items-center justify-between mb-4">
					<div className="h-6 bg-gray-300 rounded w-1/3"></div>
					<div className="h-6 bg-gray-300 rounded w-20"></div>
				</div>
				<div className="flex flex-col sm:flex-row sm:space-x-6">
					<div className="flex-1 space-y-4">
						<div className="h-4 bg-gray-300 rounded w-3/4"></div>
						<div className="h-4 bg-gray-300 rounded w-2/3"></div>
						<div className="h-4 bg-gray-300 rounded w-1/2"></div>
					</div>
					<div className="flex-1 space-y-4 mt-4 sm:mt-0">
						<div className="h-4 bg-gray-300 rounded w-full"></div>
						<div className="h-4 bg-gray-300 rounded w-5/6"></div>
						<div className="h-4 bg-gray-300 rounded w-2/3"></div>
					</div>
				</div>
				<div className="mt-6 h-40 bg-gray-300 rounded-lg"></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center text-red-600">{error}</div>
			</div>
		);
	}

	if (!bus) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center text-gray-700">No bus data found</div>
			</div>
		);
	}

	const finalStopName = stops.length > 0 ? stops[stops.length - 1].name : "N/A";
	const nextStopName = stops.length > 0 ? stops[0].name : "N/A";

	// Status badge color
	const statusColors = {
		"Not Started": "bg-gray-300 text-gray-800",
		Ongoing: "bg-blue-500 text-white",
		Reached: "bg-green-500 text-white",
		Completed: "bg-gray-600 text-white",
		"Return Ongoing": "bg-purple-500 text-white",
		"Return Completed": "bg-purple-800 text-white",
	};
	const busStatus = bus.status.current || "Not Defined";
	const badgeColor = statusColors[busStatus] || "bg-gray-300 text-gray-800";

	// Progress bar percentage for capacity
	const capacityPercent = bus.capacity
		? Math.min(100, Math.round(((bus.currLoad || 0) / bus.capacity) * 100))
		: 0;

	// Times
	const startTime = bus.startTime || "N/A";
	const endTime = bus.endTime || "N/A";
	const returnJourneyEnabled = bus.returnJourney?.enabled || false;
	const returnJourneyStart = bus.returnJourney?.startTime || "N/A";

	return (
		<div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
			{/* Summary Header - clickable to toggle */}
			<div
				className="flex items-center justify-between cursor-pointer p-4 sm:p-6"
				onClick={() => setExpanded((e) => !e)}
				aria-expanded={expanded}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") setExpanded((ex) => !ex);
				}}>
				<div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6 w-full">
					<div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 flex-grow">
						<h3 className="text-xl font-semibold text-blue-700 truncate">
							{bus.busName} ({bus.busNo})
						</h3>
						<span
							className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ml-0 sm:ml-4 ${badgeColor} whitespace-nowrap select-none`}>
							{busStatus}
						</span>
					</div>
					<div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6 mt-2 sm:mt-0 text-sm text-gray-600 min-w-[280px]">
						<div className="truncate">
							<span className="font-semibold">Next Stop:</span>{" "}
							{nextStopName}
						</div>
						<div className="truncate">
							<span className="font-semibold">ETA:</span>{" "}
							{etaNextStop ? formatDuration(etaNextStop) : "N/A"}
							{delayed && (
								<span className="ml-1 text-red-600 font-bold" title="Delayed">
									&#9888;
								</span>
							)}
						</div>
						<div className="truncate">
							<span className="font-semibold">Final Destination:</span>{" "}
							{finalStopName}
						</div>
					</div>
				</div>
				<div className="ml-4 text-gray-400 select-none">
					{expanded ? (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					) : (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
						</svg>
					)}
				</div>
			</div>

			{/* Expandable content */}
			<div
				className={`transition-all duration-500 ease-in-out overflow-hidden px-6 sm:px-8 ${
					expanded ? "max-h-[1500px] py-6" : "max-h-0 py-0"
				}`}>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					{/* Left panel: Details */}
					<div className="space-y-4">
						<div>
							<h4 className="text-lg font-semibold text-gray-800 mb-2">Driver Info</h4>
							<p>
								<span className="font-medium">Name:</span> {bus.driverName || "N/A"}
							</p>
						</div>

						<div>
							<h4 className="text-lg font-semibold text-gray-800 mb-2">Capacity</h4>
							<div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
								<div
									className="h-5 bg-green-500 transition-all duration-300"
									style={{ width: `${capacityPercent}%` }}
									aria-valuenow={capacityPercent}
									aria-valuemin="0"
									aria-valuemax="100"
									role="progressbar"
									aria-label="Bus capacity usage"
								/>
							</div>
							<p className="text-sm text-gray-700 mt-1">
								{bus.currLoad || 0} / {bus.capacity} passengers
							</p>
						</div>

						<div>
							<h4 className="text-lg font-semibold text-gray-800 mb-2">Journey Times</h4>
							<p>
								<span className="font-medium">Start Time:</span> {startTime}
							</p>
							<p>
								<span className="font-medium">End Time:</span> {endTime}
							</p>
							<p>
								<span className="font-medium">Last GPS Update:</span>{" "}
								{lastUpdated ? lastUpdated.toLocaleTimeString() : "No GPS signal"}
							</p>
						</div>

						{returnJourneyEnabled && (
							<div>
								<h4 className="text-lg font-semibold text-gray-800 mb-2">Return Journey</h4>
								<p>
									<span className="font-medium">Enabled:</span> Yes
								</p>
								<p>
									<span className="font-medium">Start Time:</span> {returnJourneyStart}
								</p>
							</div>
						)}
					</div>

					{/* Middle panel: Stops and ETA */}
					<div className="md:col-span-1 space-y-4">
						<h4 className="text-lg font-semibold text-gray-800 mb-2">Stops & ETA</h4>
						<div className="overflow-y-auto max-h-72 border border-gray-200 rounded-md p-3 bg-gray-50">
							{stops.length === 0 && (
								<p className="text-gray-600 text-sm">No stops available.</p>
							)}
							{stops.map((stop, idx) => {
								const isNext = idx === 0;
								const scheduledTime = stop.time || "N/A";
								let etaText = "N/A";
								if (isNext && etaNextStop != null) etaText = formatDuration(etaNextStop);
								return (
									<div
										key={stop.id}
										className={`flex justify-between items-center py-1 border-b last:border-b-0 ${
											isNext ? "bg-blue-100 font-semibold" : ""
										}`}>
										<div className="truncate">{stop.name}</div>
										<div className="text-xs text-gray-600 text-right min-w-[70px]">
											<span className="block">Sched: {scheduledTime}</span>
											{isNext && (
												<span
													className={`block ${
														delayed ? "text-red-600 font-bold" : "text-green-700"
													}`}>
													ETA: {etaText}
												</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Right panel: Map */}
					<div className="md:col-span-1 rounded-lg overflow-hidden border border-gray-300 min-h-[300px]">
						<div
							ref={mapContainer}
							className="w-full h-[300px]"
							aria-label="Bus route map"
						/>
						<div className="p-3 bg-gray-50 text-sm text-gray-700">
							<div>
								<span className="font-semibold">Next Stop ETA:</span>{" "}
								{etaNextStop ? formatDuration(etaNextStop) : "N/A"}
								{delayed && (
									<span className="ml-1 text-red-600 font-bold" title="Delayed">
										&#9888;
									</span>
								)}
							</div>
							<div>
								<span className="font-semibold">Final Destination ETA:</span>{" "}
								{etaFinalStop ? formatDuration(etaFinalStop) : "N/A"}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default BusInfo;
