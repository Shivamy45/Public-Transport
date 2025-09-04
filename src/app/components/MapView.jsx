"use client";
// TODO: This component is temporarily disabled from the admin dashboard
// Re-enable when bus location tracking and real-time updates are implemented
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapView() {
	const mapContainer = useRef(null);

	useEffect(() => {
		if (!mapContainer.current) return;

		// Initialize map
		const map = new mapboxgl.Map({
			container: mapContainer.current,
			style: "mapbox://styles/mapbox/streets-v11",
			center: [78.9629, 20.5937], // [lng, lat] → India center
			zoom: 15,
			maxBounds: [
				[68.176645, 6.554607], // Southwest
				[97.402561, 35.674545], // Northeast
			],
		});

		// Example marker: Delhi
		new mapboxgl.Marker({ color: "red" })
			.setLngLat([77.209, 28.6139])
			.setPopup(new mapboxgl.Popup().setText("Delhi"))
			.addTo(map);

		return () => map.remove();
	}, []);

	return (
		<div
			ref={mapContainer}
			className="h-[500px] w-full rounded-lg shadow-md"
		/>
	);
}
