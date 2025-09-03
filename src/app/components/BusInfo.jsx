import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Haversine formula to calculate distance between two lat/lng points in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
    function toRad(x) { return x * Math.PI / 180; }
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
    // Journey state
    const [currentStopIndex, setCurrentStopIndex] = useState(0);
    const [status, setStatus] = useState("Not Started"); // Not Started | Ongoing | Reached | Completed | Return Ongoing | Return Completed
    const [isReturn, setIsReturn] = useState(false);
    // Geolocation state
    const [driverLocation, setDriverLocation] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    // Mapbox
    const mapContainer = useRef(null);
    const mapRef = useRef(null);

    // Fetch bus and stops
    useEffect(() => {
        const fetchData = async () => {
            if (!busId) return;
            // Fetch bus document
            const busDocRef = doc(db, "buses", busId);
            const busSnap = await getDoc(busDocRef);
            if (!busSnap.exists()) return;
            const busData = busSnap.data();
            setBus(busData);
            // Fetch stops subcollection, order by sequence or index
            const stopsCol = collection(busDocRef, "stops");
            const stopsSnap = await getDocs(stopsCol);
            let stopArr = [];
            stopsSnap.forEach((doc) => {
                stopArr.push({ id: doc.id, ...doc.data() });
            });
            // Sort by index/sequence if available
            stopArr.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
            setStops(stopArr);
        };
        fetchData();
    }, [busId]);

    // Mapbox setup
    useEffect(() => {
        if (!stops.length || !mapContainer.current) return;
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1IjoiZGVtb3VzZXIiLCJhIjoiY2xkZ2h6Y2Q5MDAwOTQwcDdtbGd2bWp1bCJ9.9Zq4S5UQ9pWZb1r2JX5S3A"; // fallback
        if (mapRef.current) {
            mapRef.current.remove();
        }
        const center = [stops[0].lng, stops[0].lat];
        mapRef.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center,
            zoom: 12,
        });
        // Draw polyline
        mapRef.current.on("load", () => {
            mapRef.current.addSource("route", {
                type: "geojson",
                data: {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "LineString",
                        coordinates: stops.map((stop) => [stop.lng, stop.lat]),
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
            // Add markers
            stops.forEach((stop, idx) => {
                new mapboxgl.Marker({ color: idx === currentStopIndex ? "#FF4136" : "#2ECC40" })
                    .setLngLat([stop.lng, stop.lat])
                    .setPopup(new mapboxgl.Popup().setText(`${stop.name}`))
                    .addTo(mapRef.current);
            });
        });
        // Center on driver's location if available
        if (driverLocation) {
            mapRef.current.setCenter([driverLocation.lng, driverLocation.lat]);
        }
        // Clean up
        return () => {
            if (mapRef.current) mapRef.current.remove();
        };
    // eslint-disable-next-line
    }, [stops, currentStopIndex]);

    // Watch driver geolocation
    useEffect(() => {
        let watchId;
        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setDriverLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                    });
                    setLastUpdated(new Date());
                },
                (err) => {
                    // ignore
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
            );
        }
        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, []);

    // Auto-mark stop as reached if within threshold (e.g., 60 meters)
    useEffect(() => {
        if (
            !driverLocation ||
            !stops.length ||
            currentStopIndex >= stops.length ||
            status === "Completed" ||
            status === "Return Completed"
        )
            return;
        const nextStop = stops[currentStopIndex];
        const dist = haversineDistance(
            driverLocation.lat,
            driverLocation.lng,
            nextStop.lat,
            nextStop.lng
        );
        if (dist < 60 && status !== "Reached") {
            setStatus("Reached");
        }
    }, [driverLocation, stops, currentStopIndex, status]);

    // Handlers
    const handleStartJourney = () => {
        setStatus("Ongoing");
        setCurrentStopIndex(0);
        setIsReturn(false);
    };
    const handleReachStop = () => {
        if (currentStopIndex < stops.length - 1) {
            setCurrentStopIndex((idx) => idx + 1);
            setStatus("Ongoing");
        } else {
            setStatus("Completed");
        }
    };
    const handleStartReturnJourney = () => {
        setIsReturn(true);
        setStatus("Return Ongoing");
        setCurrentStopIndex(0);
        setStops((prev) => [...prev].reverse());
    };
    const handleReachReturnStop = () => {
        if (currentStopIndex < stops.length - 1) {
            setCurrentStopIndex((idx) => idx + 1);
            setStatus("Return Ongoing");
        } else {
            setStatus("Return Completed");
        }
    };

    // Compute current status
    let journeyStatusLabel = "";
    if (status === "Not Started") {
        journeyStatusLabel = "Starting from " + (stops[0]?.name || "");
    } else if (status === "Ongoing") {
        journeyStatusLabel =
            "Ongoing to " +
            (stops[currentStopIndex + 1]?.name || stops[stops.length - 1]?.name);
    } else if (status === "Reached") {
        journeyStatusLabel =
            "Reached " + (stops[currentStopIndex]?.name || "");
    } else if (status === "Completed") {
        journeyStatusLabel = "Forward journey completed";
    } else if (status === "Return Ongoing") {
        journeyStatusLabel =
            "Return journey ongoing to " +
            (stops[currentStopIndex + 1]?.name || stops[stops.length - 1]?.name);
    } else if (status === "Return Completed") {
        journeyStatusLabel = "Return journey completed";
    }

    // Current load
    const currLoad = bus?.currLoad ?? "-";
    // Capacity
    const capacity = bus?.capacity ?? "-";
    // Driver name
    const driverName = bus?.driverName ?? "";
    // Bus no and name
    const busNo = bus?.busNo ?? "";
    const busName = bus?.busName ?? "";
    // Start stop name
    const startStopName = stops[0]?.name ?? "";
    // Last updated
    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString()
        : bus?.lastUpdated
        ? new Date(bus.lastUpdated.seconds * 1000).toLocaleTimeString()
        : "";

    // Next stop
    const nextStopName =
        currentStopIndex < stops.length
            ? stops[currentStopIndex]?.name
            : "";
    // End stop
    const endStopName = stops[stops.length - 1]?.name ?? "";

    // ETA: just show distance for now
    let ETA = "";
    if (
        driverLocation &&
        currentStopIndex < stops.length &&
        stops.length > 0
    ) {
        const dist = haversineDistance(
            driverLocation.lat,
            driverLocation.lng,
            stops[currentStopIndex].lat,
            stops[currentStopIndex].lng
        );
        ETA = `${Math.round(dist)} m`;
    }

    // Return journey enabled
    const returnJourneyEnabled = !!bus?.returnJourney;

    return (
        <div className="flex">
            {/* Left panel: Details */}
            <div className="flex flex-col gap-2 p-4 border-r min-w-[220px]">
                <div>
                    <p className="text-xl font-bold">{busNo}</p>
                    <p className="text-lg">{busName}</p>
                </div>
                <p className="text-sm text-gray-700">
                    {"Driver: " + driverName}
                </p>
                <p className="text-sm">
                    {currLoad + " / " + capacity} <span className="text-xs">seats</span>
                </p>
                <p className="text-sm">
                    {"Started From: " + startStopName}
                </p>
                <div className="text-xs text-gray-500">
                    <p>Status: {journeyStatusLabel}</p>
                    <p>Last Updated: {lastUpdatedStr}</p>
                </div>
            </div>
            {/* Middle panel: Journey controls */}
            <div className="flex flex-col items-center justify-center px-6 gap-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded mb-2 cursor-default" disabled>
                    {journeyStatusLabel}
                </button>
                {status === "Not Started" && (
                    <button
                        className="bg-green-500 text-white px-4 py-2 rounded"
                        onClick={handleStartJourney}
                    >
                        Start Journey
                    </button>
                )}
                {status === "Reached" && !isReturn && (
                    <button
                        className="bg-green-600 text-white px-4 py-2 rounded"
                        onClick={handleReachStop}
                    >
                        Continue to Next Stop
                    </button>
                )}
                {status === "Completed" && returnJourneyEnabled && !isReturn && (
                    <button
                        className="bg-indigo-600 text-white px-4 py-2 rounded"
                        onClick={handleStartReturnJourney}
                    >
                        Start Return Journey
                    </button>
                )}
                {status === "Reached" && isReturn && (
                    <button
                        className="bg-green-600 text-white px-4 py-2 rounded"
                        onClick={handleReachReturnStop}
                    >
                        Continue to Next Stop (Return)
                    </button>
                )}
            </div>
            {/* Right panel: Map */}
            <div className="flex-1 min-w-[320px] h-[400px] relative">
                <div
                    ref={mapContainer}
                    className="absolute inset-0"
                    style={{ minHeight: 400, minWidth: 320 }}
                />
                {/* Next/End stop info overlay */}
                <div className="absolute top-2 right-2 bg-white bg-opacity-80 p-2 rounded shadow text-xs">
                    <div>
                        <strong>Next Stop:</strong> {nextStopName}
                        {ETA && <span> ({ETA})</span>}
                    </div>
                    <div>
                        <strong>End Stop:</strong> {endStopName}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BusInfo;
