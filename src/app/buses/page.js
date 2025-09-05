"use client";
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import UserBusInfo from "../components/UserBusInfo";

const page = () => {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [pickup, setPickup] = useState("");
	const [drop, setDrop] = useState("");
	const [buses, setBuses] = useState([]);
	const [stops, setStops] = useState([]);
	const [pickupSuggestions, setPickupSuggestions] = useState([]);
	const [dropSuggestions, setDropSuggestions] = useState([]);
	const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
	const [showDropSuggestions, setShowDropSuggestions] = useState(false);
	const [selectedPickupStop, setSelectedPickupStop] = useState(null);
	const [selectedDropStop, setSelectedDropStop] = useState(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchStops = async () => {
			try {
				const stopsRef = collection(db, "stops");
				const snapshot = await getDocs(stopsRef);
				const stopsList = snapshot.docs.map((doc) => {
					const data = doc.data();
					return {
						docId: doc.id,
						stopId: data.stopId,
						stopName: data.stopName,
					};
				});
				setStops(stopsList);
				console.log("Fetched stops:", stopsList);

				// After stops are fetched, try to restore selected stops
				let pickupStopId = null;
				let dropStopId = null;

				// Try to get from query params first
				if (searchParams) {
					pickupStopId = searchParams.get("pickup");
					dropStopId = searchParams.get("drop");
				}

				// If not in query params, try localStorage
				if (!pickupStopId) {
					pickupStopId = localStorage.getItem("selectedPickupStopId");
				}
				if (!dropStopId) {
					dropStopId = localStorage.getItem("selectedDropStopId");
				}

				if (pickupStopId && dropStopId) {
					const pickupStop = stopsList.find(
						(stop) => stop.stopId === pickupStopId
					);
					const dropStop = stopsList.find(
						(stop) => stop.stopId === dropStopId
					);

					if (pickupStop && dropStop) {
						setSelectedPickupStop(pickupStop);
						setSelectedDropStop(dropStop);
						setPickup(pickupStop.stopName);
						setDrop(dropStop.stopName);
						fetchBusesForRoute(pickupStop.stopId, dropStop.stopId);
					}
				}
			} catch (error) {
				console.error("Error fetching stops:", error);
			}
		};
		fetchStops();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const fetchBusesForRoute = async (pickupStopId, dropStopId) => {
		setLoading(true);
		try {
			const busesSnap = await getDocs(collection(db, "buses"));
			const filteredBuses = busesSnap.docs
				.map((doc) => {
					const bus = { id: doc.id, ...doc.data() };
					const stopIds = bus.stops.map((s) => s.stopId);
					console.log("Bus ID:", bus.id);
					console.log("Stop IDs:", stopIds);
					console.log(
						"PickupStopId:",
						pickupStopId,
						"DropStopId:",
						dropStopId
					);
					const passesFilter =
						stopIds.includes(pickupStopId) &&
						stopIds.includes(dropStopId);
					console.log("Passes filter:", passesFilter);
					return bus;
				})
				.filter((bus) => {
					const stopIds = bus.stops.map((s) => s.stopId);
					return (
						stopIds.includes(pickupStopId) &&
						stopIds.includes(dropStopId)
					);
				});
			setBuses(filteredBuses);
		} catch (err) {
			console.error("Error fetching buses:", err);
		} finally {
			setLoading(false);
		}
	};

	const handleModify = () => {
		if (!selectedPickupStop || !selectedDropStop) {
			alert("Please select both pickup and drop stops.");
			return;
		}
		localStorage.setItem("selectedPickupStopId", selectedPickupStop.stopId);
		localStorage.setItem("selectedDropStopId", selectedDropStop.stopId);
		fetchBusesForRoute(selectedPickupStop.stopId, selectedDropStop.stopId);
	};

	const onPickupChange = (e) => {
		const value = e.target.value;
		setPickup(value);
		setSelectedPickupStop(null);
		if (value.length > 0) {
			const filtered = stops.filter((stop) =>
				stop.stopName.toLowerCase().includes(value.toLowerCase())
			);
			console.log("Pickup suggestions for:", value, "found:", filtered);
			setPickupSuggestions(filtered);
			setShowPickupSuggestions(true);
		} else {
			setPickupSuggestions([]);
			setShowPickupSuggestions(false);
		}
	};

	const onDropChange = (e) => {
		const value = e.target.value;
		setDrop(value);
		setSelectedDropStop(null);
		if (value.length > 0) {
			const filtered = stops.filter((stop) =>
				stop.stopName.toLowerCase().includes(value.toLowerCase())
			);
			console.log("Drop suggestions for:", value, "found:", filtered);
			setDropSuggestions(filtered);
			setShowDropSuggestions(true);
		} else {
			setDropSuggestions([]);
			setShowDropSuggestions(false);
		}
	};

	const selectPickupSuggestion = (suggestion) => {
		setPickup(suggestion.stopName);
		setSelectedPickupStop(suggestion);
		setPickupSuggestions([]);
		setShowPickupSuggestions(false);
	};

	const selectDropSuggestion = (suggestion) => {
		setDrop(suggestion.stopName);
		setSelectedDropStop(suggestion);
		setDropSuggestions([]);
		setShowDropSuggestions(false);
	};

	return (
		<div className="max-w-4xl mx-auto p-6">
			<div className="flex flex-wrap gap-4 items-center mb-6">
				<div className="relative flex-1 min-w-[200px]">
					<input
						type="text"
						placeholder="Pickup Location"
						value={pickup}
						onChange={onPickupChange}
						onFocus={() => {
							if (pickupSuggestions.length > 0)
								setShowPickupSuggestions(true);
						}}
						onBlur={() => {
							setTimeout(
								() => setShowPickupSuggestions(false),
								150
							);
						}}
						className="w-full border border-gray-300 rounded-md px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					{showPickupSuggestions && pickupSuggestions.length > 0 && (
						<ul className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-b-md max-h-48 overflow-y-auto z-20 shadow-md">
							{pickupSuggestions.map((suggestion) => (
								<li
									key={suggestion.docId}
									onClick={() =>
										selectPickupSuggestion(suggestion)
									}
									onMouseDown={(e) => e.preventDefault()}
									className="cursor-pointer px-4 py-2 hover:bg-blue-100">
									{suggestion.stopName}
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="relative flex-1 min-w-[200px]">
					<input
						type="text"
						placeholder="Drop Location"
						value={drop}
						onChange={onDropChange}
						onFocus={() => {
							if (dropSuggestions.length > 0)
								setShowDropSuggestions(true);
						}}
						onBlur={() => {
							setTimeout(
								() => setShowDropSuggestions(false),
								150
							);
						}}
						className="w-full border border-gray-300 rounded-md px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					{showDropSuggestions && dropSuggestions.length > 0 && (
						<ul className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-b-md max-h-48 overflow-y-auto z-20 shadow-md">
							{dropSuggestions.map((suggestion) => (
								<li
									key={suggestion.docId}
									onClick={() =>
										selectDropSuggestion(suggestion)
									}
									onMouseDown={(e) => e.preventDefault()}
									className="cursor-pointer px-4 py-2 hover:bg-blue-100">
									{suggestion.stopName}
								</li>
							))}
						</ul>
					)}
				</div>

				<button
					onClick={handleModify}
					className="bg-blue-600 text-white rounded-md px-6 py-2 text-lg font-semibold hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap">
					Modify
				</button>
			</div>
			<div className="flex w-full flex-col gap-5">
				{loading ? (
					<div>Loading...</div>
				) : buses.length > 0 ? (
					buses.map((bus) => (
						<UserBusInfo
							key={bus.id}
							busId={bus.id}
							pickupStop={selectedPickupStop}
							dropStop={selectedDropStop}
						/>
					))
				) : (
					"No Buses Found"
				)}
			</div>
		</div>
	);
};

export default page;
