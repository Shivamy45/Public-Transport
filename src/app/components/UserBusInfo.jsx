import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FaMapMarkerAlt, FaClock, FaUsers, FaRoute, FaExclamationTriangle } from "react-icons/fa";

const UserBusInfo = ({ busId }) => {
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
    const routeSourceId = `route-${busId}`;

    // --- DATA FETCHING (REAL-TIME) ---
    useEffect(() => {
        if (!busId) return;

        setLoading(true);
        setError("");

        const unsubscribe = onSnapshot(doc(db, "buses", busId), (docSnap) => {
            if (docSnap.exists()) {
                const busData = docSnap.data();
                setBus(busData);
                setStops(busData.stops || []);

                if (busData.location && busData.location.lat && busData.location.lng) {
                    setDriverLocation(busData.location);
                    setLastUpdated(busData.location.lastUpdated?.toDate() || new Date());
                } else {
                    setDriverLocation(null);
                }
                setLoading(false);
            } else {
                setError("Bus not found");
                setLoading(false);
            }
        }, (err) => {
            console.error("Error fetching bus:", err);
            setError("Failed to load bus data");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [busId]);

    // --- MAP INITIALIZATION & UPDATES ---
    useEffect(() => {
        if (!mapContainer.current || !stops.length || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
            return;
        }
        
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

        if (!mapRef.current) {
            mapRef.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: "mapbox://styles/mapbox/streets-v12",
                center: [stops[0].lng, stops[0].lat],
                zoom: 10,
            });
        }
        
        const map = mapRef.current;

        const setupMap = () => {
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];

            stops.forEach((stop, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === stops.length - 1;
                const color = isFirst ? "#10B981" : isLast ? "#EF4444" : "#3B82F6";
                
                const marker = new mapboxgl.Marker({ color })
                    .setLngLat([stop.lng, stop.lat])
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<strong>${stop.stopName}</strong><br>Time: ${stop.stopTime}`))
                    .addTo(map);
                markersRef.current.push(marker);
            });

            if (driverLocation) {
                const busMarker = new mapboxgl.Marker({ color: "#F59E0B", scale: 1.5 })
                    .setLngLat([driverLocation.lng, driverLocation.lat])
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<strong>Bus Location</strong>`))
                    .addTo(map);
                markersRef.current.push(busMarker);
            }

            const bounds = new mapboxgl.LngLatBounds();
            stops.forEach((stop) => bounds.extend([stop.lng, stop.lat]));
            if (driverLocation) {
                bounds.extend([driverLocation.lng, driverLocation.lat]);
            }
            map.fitBounds(bounds, { padding: 60, duration: 1000 });
        };
        
        map.on('load', setupMap);

        return () => {
            map.off('load', setupMap);
        };
        
    }, [bus, stops, driverLocation]);

    // --- ROUTE DRAWING ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map || stops.length < 2) return;

        const drawRoute = () => {
            const coords = stops.map(s => [s.lng, s.lat]);
            if (driverLocation) {
                coords.unshift([driverLocation.lng, driverLocation.lat]);
            }
            
            if (map.getSource(routeSourceId)) {
                map.removeLayer(routeSourceId);
                map.removeSource(routeSourceId);
            }

            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords.join(';')}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

            fetch(url).then(res => res.json()).then(data => {
                if (data.routes?.length > 0) {
                    const route = data.routes[0].geometry;
                    map.addSource(routeSourceId, { type: 'geojson', data: route });
                    map.addLayer({
                        id: routeSourceId,
                        type: 'line',
                        source: routeSourceId,
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#3B82F6', 'line-width': 5, 'line-opacity': 0.8 },
                    });

                    const { duration, legs } = data.routes[0];
                    setEtaData({
                        next: legs[0]?.duration || null,
                        final: duration
                    });
                }
            }).catch(err => console.error("Error fetching route: ", err));
        };
        
        if (map.isStyleLoaded()) {
            drawRoute();
        } else {
            map.on('load', drawRoute);
        }

    }, [driverLocation, stops]);


    // --- RENDER LOGIC ---
    if (loading) {
        return <div className="bg-white rounded-lg shadow-md border p-6 animate-pulse h-[30rem]"></div>;
    }
    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center">
                <FaExclamationTriangle className="mr-2" /> {error}
            </div>
        );
    }
    if (!bus) return null;

    const statusInfo = bus.status?.current ? 
        { "Not Started": { color: "bg-gray-500", text: "Not Started" },
          "Ongoing": { color: "bg-blue-500", text: "En Route" } }[bus.status.current] || { color: "bg-yellow-500", text: bus.status.current }
        : { color: "bg-gray-500", text: "Unknown" };

    const capacityPercent = bus.capacity ? Math.round(((bus.currLoad || 0) / bus.capacity) * 100) : 0;
    const formatDuration = (seconds) => seconds ? `${Math.round(seconds / 60)} min` : "N/A";

    return (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <h3 className="text-2xl font-bold text-gray-800">{bus.busName} ({bus.busNo})</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusInfo.color}`}>
                            {statusInfo.text}
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
                    <InfoItem icon={<FaMapMarkerAlt className="text-green-600"/>} label="Next Stop" value={stops[bus.status?.currentStopIndex || 0]?.stopName || "N/A"}/>
                    <InfoItem icon={<FaClock className="text-blue-600"/>} label="ETA to Next" value={formatDuration(etaData.next)}/>
                    <InfoItem icon={<FaUsers className="text-purple-600"/>} label="Occupancy" value={`${bus.currLoad || 0}/${bus.capacity} (${capacityPercent}%)`}/>
                    <InfoItem icon={<FaRoute className="text-orange-600"/>} label="Final Stop" value={stops[stops.length-1]?.stopName || "N/A"}/>
                </div>
            </div>
            <div className="px-6 pb-6 border-t border-gray-200">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
                    <div className="space-y-6">
                        <DetailSection title="Journey Schedule" icon={<FaClock className="text-blue-600" />}>
                            <DetailItem label="Start Time" value={bus.startTime || "N/A"} />
                            <DetailItem label="End Time" value={bus.endTime || "N/A"} />
                            <DetailItem label="Total Journey ETA" value={formatDuration(etaData.final)} />
                            <DetailItem label="Last GPS Update" value={lastUpdated ? lastUpdated.toLocaleTimeString() : "No signal"} />
                        </DetailSection>
                        <DetailSection title={`All Stops (${stops.length})`} icon={<FaRoute className="text-orange-600" />}>
                            <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                                {stops.map((stop, idx) => (
                                    <div key={stop.stopId} className="flex justify-between items-center text-sm p-2 rounded-md bg-gray-50 border">
                                        <span className="font-medium text-gray-700">{idx + 1}. {stop.stopName}</span>
                                        <span className="font-mono text-gray-500">{stop.stopTime}</span>
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
                            <div ref={mapContainer} className="w-full h-96" aria-label="Bus route map" />
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
        <div className="bg-gray-50 rounded-lg p-4 border">
            {children}
        </div>
    </div>
);

const DetailItem = ({ label, value }) => (
    <div className="flex justify-between text-sm py-1 border-b last:border-b-0">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{value}</span>
    </div>
);

export default UserBusInfo;