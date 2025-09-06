import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
	FaMapMarkerAlt,
	FaClock,
	FaUsers,
	FaRoute,
	FaExclamationTriangle,
} from "react-icons/fa";

const UserBusInfo = ({ busId, pickupStop, dropStop }) => {
	// --- STATE MANAGEMENT ---
	const [bus, setBus] = useState(null);
	const [stops, setStops] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [driverLocation, setDriverLocation] = useState(null);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [etaData, setEtaData] = useState({ next: null, final: null });

	// --- REFS ---
	const mapContainer = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const boundsSetRef = useRef(false);
	const routeSourceId = `route-${busId}`;

	// --- DATA FETCHING (REAL-TIME) ---
	useEffect(() => {
		if (!busId) return;

		setLoading(true);
		setError("");
		// Reset bounds when bus changes
		boundsSetRef.current = false;

		// Bus document listener
		const unsubscribeBus = onSnapshot(
			doc(db, "buses", busId),
			async (docSnap) => {
				if (docSnap.exists()) {
					const busData = docSnap.data();
					setBus(busData);

					if (busData.stops && Array.isArray(busData.stops)) {
						try {
							const fetchedStops = await Promise.all(
								busData.stops.map(async (stop) => {
									// Use stopRef instead of stopId
									const stopDoc = await getDoc(
										doc(db, "stops", stop.stopRef)
									);
									if (stopDoc.exists()) {
										const stopData = stopDoc.data();
										// Normalize stop data structure with correct field names
										return {
											stopId: stop.stopRef, // Use stopRef as stopId
											stopName: stopData.stopName,
											stopTime: stop.stopTime,
											dayOffset: stop.dayOffset,
											lat: stopData.lat, // Fixed: use 'lat' not 'ltd'
											lng: stopData.lng,
										};
									} else {
										// Fallback with original data if stop doc not found
										return {
											stopId: stop.stopRef,
											stopName: "Unknown Stop",
											stopTime: stop.stopTime,
											dayOffset: stop.dayOffset,
											lat: 0,
											lng: 0,
										};
									}
								})
							);
							setStops(fetchedStops);
						} catch (err) {
							console.error("Error fetching stops:", err);
							setStops(busData.stops || []);
						}
					} else {
						setStops([]);
					}

					setLoading(false);
				} else {
					setError("Bus not found");
					setLoading(false);
				}
			},
			(err) => {
				console.error("Error fetching bus:", err);
				setError("Failed to load bus data");
				setLoading(false);
			}
		);

		// Tracker document listener for driver location
		const unsubscribeTracker = onSnapshot(
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

		// Cleanup both listeners
		return () => {
			unsubscribeBus();
			unsubscribeTracker();
		};
	}, [busId]);

	// --- MAP INITIALIZATION & UPDATES ---
	useEffect(() => {
		if (
			!mapContainer.current ||
			!process.env.NEXT_PUBLIC_MAPBOX_TOKEN
		) {
			return;
		}

		mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

		if (!mapRef.current) {
			// Initialize map even if stops is empty with fallback center
			const firstStop = stops[0];
			const isValidLatLng =
				firstStop &&
				typeof firstStop.lat === "number" &&
				!isNaN(firstStop.lat) &&
				typeof firstStop.lng === "number" &&
				!isNaN(firstStop.lng);
			const center = isValidLatLng
				? [firstStop.lng, firstStop.lat]
				: [77.5946, 12.9716]; // Fallback center

			mapRef.current = new mapboxgl.Map({
				container: mapContainer.current,
				style: "mapbox://styles/mapbox/streets-v12",
				center,
				zoom: 10,
			});
		}

		const map = mapRef.current;

		const setupMap = () => {
			markersRef.current.forEach((m) => m.remove());
			markersRef.current = [];

			// Ensure all stops get markers with proper colors and popups
			stops.forEach((stop, idx) => {
				const hasLL =
					typeof stop?.lat === "number" &&
					!isNaN(stop.lat) &&
					typeof stop?.lng === "number" &&
					!isNaN(stop.lng);
				if (!hasLL) return; // skip invalid stops safely

				const isFirst = idx === 0;
				const isLast = idx === stops.length - 1;
				const color = isFirst
					? "#10B981" // Green for first stop
					: isLast
					? "#EF4444" // Red for last stop
					: "#3B82F6"; // Blue for middle stops

				const marker = new mapboxgl.Marker({ color })
					.setLngLat([stop.lng, stop.lat])
					.setPopup(
						new mapboxgl.Popup({ offset: 25 }).setHTML(
							`<strong>${stop.stopName}</strong><br>Time: ${stop.stopTime}`
						)
					)
					.addTo(map);
				markersRef.current.push(marker);
			});

			// Driver marker (orange)
			if (driverLocation) {
				const busMarker = new mapboxgl.Marker({
					color: "#F59E0B",
					scale: 1.5,
				})
					.setLngLat([driverLocation.lng, driverLocation.lat])
					.setPopup(
						new mapboxgl.Popup({ offset: 25 }).setHTML(
							`<strong>Bus Location</strong>`
						)
					)
					.addTo(map);
				markersRef.current.push(busMarker);
			}

			// Fit bounds only once per load or major change
			if (!boundsSetRef.current) {
				const bounds = new mapboxgl.LngLatBounds();
				stops.forEach((stop) => {
					const hasLL =
						typeof stop?.lat === "number" &&
						!isNaN(stop.lat) &&
						typeof stop?.lng === "number" &&
						!isNaN(stop.lng);
					if (hasLL) bounds.extend([stop.lng, stop.lat]);
				});
				if (
					driverLocation &&
					typeof driverLocation?.lat === "number" &&
					typeof driverLocation?.lng === "number"
				) {
					bounds.extend([driverLocation.lng, driverLocation.lat]);
				}
				if (!bounds.isEmpty()) {
					map.fitBounds(bounds, { padding: 60, duration: 1000 });
					boundsSetRef.current = true;
				}
			}
		};

		map.on("load", setupMap);

		return () => {
			map.off("load", setupMap);
		};
	}, [bus, stops, driverLocation]);

	// --- ROUTE DRAWING ---
	useEffect(() => {
		const map = mapRef.current;
		if (!map || stops.length < 2) return;

		const drawRoute = () => {
			// Keep only valid stops
			const validStops = stops.filter(
				(s) =>
					typeof s?.lat === "number" &&
					!isNaN(s.lat) &&
					typeof s?.lng === "number" &&
					!isNaN(s.lng)
			);
			if (
				validStops.length < 2 &&
				!(driverLocation && validStops.length >= 1)
			)
				return;

			let coords = [];

			const hasDriverLL =
				driverLocation &&
				typeof driverLocation.lat === "number" &&
				typeof driverLocation.lng === "number" &&
				!isNaN(driverLocation.lat) &&
				!isNaN(driverLocation.lng);
			const notStarted =
				bus?.status?.current === "Not Started" || !hasDriverLL;

			if (notStarted) {
				// Case 1: Bus not started -> full planned route using all stops
				coords = validStops.map((s) => [s.lng, s.lat]);
			} else {
				// Case 2: Bus started -> driver location to remaining stops
				const total = validStops.length;
				const rawIdx =
					typeof bus?.status?.currentStopIndex === "number"
						? bus.status.currentStopIndex
						: 0;
				const currentIdx = Math.min(Math.max(rawIdx, 0), total - 1);
				const remaining = validStops.slice(currentIdx);
				const remainder = remaining.length
					? remaining
					: [validStops[total - 1]]; // ensure at least final stop
				coords = [
					[driverLocation.lng, driverLocation.lat],
					...remainder.map((s) => [s.lng, s.lat]),
				];
			}

			if (coords.length < 2) return;

			// Respect Mapbox's 25 waypoint limit
			if (coords.length > 25) {
				const step = Math.floor(coords.length / 25);
				coords = coords.filter((_, idx) => idx % step === 0 || idx === coords.length - 1);
			}

			// Remove previous route, if any
			if (map.getSource(routeSourceId)) {
				if (map.getLayer(routeSourceId)) {
					map.removeLayer(routeSourceId);
				}
				map.removeSource(routeSourceId);
			}

			const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords.join(
				";"
			)}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

			fetch(url)
				.then((res) => res.json())
				.then((data) => {
					if (data.routes?.length > 0) {
						const routeGeom = data.routes[0].geometry; // GeoJSON LineString
						// Fix route source to use FeatureCollection
						const featureCollection = {
							type: "FeatureCollection",
							features: [
								{
									type: "Feature",
									properties: {},
									geometry: routeGeom,
								},
							],
						};
						map.addSource(routeSourceId, {
							type: "geojson",
							data: featureCollection,
						});
						map.addLayer({
							id: routeSourceId,
							type: "line",
							source: routeSourceId,
							layout: {
								"line-join": "round",
								"line-cap": "round",
							},
							paint: {
								"line-color": "#3B82F6",
								"line-width": 5,
								"line-opacity": 0.8,
							},
						});

						const { duration, legs } = data.routes[0];
						setEtaData({
							next: legs?.[0]?.duration || null,
							final: duration || null,
						});
					}
				})
				.catch((err) => console.error("Error fetching route: ", err));
		};

		if (map.isStyleLoaded()) {
			drawRoute();
		} else {
			map.on("load", drawRoute);
			return () => map.off("load", drawRoute);
		}
	}, [driverLocation, stops, bus]);

	// --- RENDER LOGIC ---
	if (loading) {
		return (
			<div className="bg-white rounded-lg shadow-md border p-6 animate-pulse h-[30rem]"></div>
		);
	}
	if (error) {
		return (
			<div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center">
				<FaExclamationTriangle className="mr-2" /> {error}
			</div>
		);
	}
	if (!bus) return null;

	const statusInfo = bus.status?.current
		? {
				"Not Started": { color: "bg-gray-500", text: "Not Started" },
				Ongoing: { color: "bg-blue-500", text: "En Route" },
		  }[bus.status.current] || {
				color: "bg-yellow-500",
				text: bus.status.current,
		  }
		: { color: "bg-gray-500", text: "Unknown" };

	const capacityPercent = bus.capacity
		? Math.round(((bus.currLoad || 0) / bus.capacity) * 100)
		: 0;
	const formatDuration = (seconds) =>
		seconds ? `${Math.round(seconds / 60)} min` : "N/A";

	return (
		<div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
			<div className="p-6">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4">
					<div className="flex items-center space-x-3">
						<h3 className="text-2xl font-bold text-gray-800">
							{bus.busName} ({bus.busNo})
						</h3>
						<span
							className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusInfo.color}`}>
							{statusInfo.text}
						</span>
					</div>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
				<InfoItem
					icon={<FaMapMarkerAlt className="text-green-600" />}
					label="Next Stop"
					value={
						// Show stop at currentStopIndex if bus started, else first stop
						bus?.status?.current === "Not Started"
							? stops[0]?.stopName || "N/A"
							: stops[bus.status?.currentStopIndex || 0]?.stopName || "N/A"
					}
				/>
					<InfoItem
						icon={<FaClock className="text-blue-600" />}
						label="ETA to Next"
						value={formatDuration(etaData.next)}
					/>
					<InfoItem
						icon={<FaUsers className="text-purple-600" />}
						label="Occupancy"
						value={`${bus.currLoad || 0}/${
							bus.capacity
						} (${capacityPercent}%)`}
					/>
					<InfoItem
						icon={<FaRoute className="text-orange-600" />}
						label="Final Stop"
						value={stops[stops.length - 1]?.stopName || "N/A"}
					/>
				</div>
			</div>
			<div className="px-6 pb-6 border-t border-gray-200">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
					<div className="space-y-6">
						<DetailSection
							title="Journey Schedule"
							icon={<FaClock className="text-blue-600" />}>
							<DetailItem
								label="Start Time"
								value={bus.startTime || "N/A"}
							/>
							<DetailItem
								label="End Time"
								value={bus.endTime || "N/A"}
							/>
							<DetailItem
								label="Total Journey ETA"
								value={formatDuration(etaData.final)}
							/>
							<DetailItem
								label="Last GPS Update"
								value={
									lastUpdated
										? lastUpdated.toLocaleTimeString()
										: "No signal"
								}
							/>
						</DetailSection>
						<DetailSection
							title={`All Stops (${stops.length})`}
							icon={<FaRoute className="text-orange-600" />}>
							<div className="max-h-80 overflow-y-auto space-y-2 pr-2">
								{stops.map((stop, idx) => (
									<div
										key={stop.stopId}
										className="flex justify-between items-center text-sm p-2 rounded-md bg-gray-50 border">
										<span className="font-medium text-gray-700">
											{idx + 1}.
										</span>
										<span className="font-medium text-gray-700">
											{stop.stopName}
										</span>
										<span className="font-mono text-gray-500">
											{stop.stopTime}
										</span>
									</div>
								))}
							</div>
						</DetailSection>
					</div>
					<div>
						<h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
							<FaMapMarkerAlt className="mr-2 text-green-600" />
							Live Route Map
						</h4>
						<div className="rounded-lg overflow-hidden border border-gray-300">
							<div
								ref={mapContainer}
								className="w-full h-96"
								aria-label="Bus route map"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const InfoItem = ({ icon, label, value }) => (
	<div className="flex items-center space-x-2">
		{icon}
		<div>
			<div className="font-semibold text-gray-700">{label}</div>
			<div className="text-gray-600">{value}</div>
		</div>
	</div>
);

const DetailSection = ({ title, icon, children }) => (
	<div>
		<h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
			{icon}
			<span className="ml-2">{title}</span>
		</h4>
		<div className="bg-gray-50 rounded-lg p-4 border">{children}</div>
	</div>
);

const DetailItem = ({ label, value }) => (
	<div className="flex justify-between text-sm py-1 border-b last:border-b-0">
		<span className="text-gray-600">{label}</span>
		<span className="font-semibold text-gray-800">{value}</span>
	</div>
);

export default UserBusInfo;
