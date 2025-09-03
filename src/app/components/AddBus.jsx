"use client";

import React, { useEffect, useState } from "react";
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

const AddBus = () => {
	const [busNo, setBusNo] = useState("");
	const [busName, setBusName] = useState("");
	const [driverName, setDriverName] = useState("");
	const [capacity, setCapacity] = useState("");
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [returnJourneyEnabled, setReturnJourneyEnabled] = useState(false);
	const [returnStartTime, setReturnStartTime] = useState("");

	const [stops, setStops] = useState([]);
	const [stopPlace, setStopPlace] = useState("");
	const [stopTime, setStopTime] = useState("");
	const [stopSuggestions, setStopSuggestions] = useState([]);
	const [selectedStop, setSelectedStop] = useState(null);

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	const [currentUser, setCurrentUser] = useState(null);

	useEffect(() => {
		try {
			const saved =
				typeof window !== "undefined"
					? localStorage.getItem("currentUser")
					: null;
			if (saved) setCurrentUser(JSON.parse(saved));
		} catch (_) {}
	}, []);

	useEffect(() => {
		if (stopPlace.length > 0) {
			const fetchSuggestions = async () => {
				try {
					const response = await fetch(
						`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
							stopPlace
						)}.json?country=IN&limit=5&access_token=${
							process.env.NEXT_PUBLIC_MAPBOX_TOKEN
						}`
					);
					const data = await response.json();
					if (data.features) {
						setStopSuggestions(data.features);
					} else {
						setStopSuggestions([]);
					}
				} catch {
					setStopSuggestions([]);
				}
			};
			fetchSuggestions();
		} else {
			setStopSuggestions([]);
		}
	}, [stopPlace]);

	const handleAddStop = async () => {
		setError("");
		if (!stopPlace || !stopTime) {
			setError("Please fill all stop fields.");
			return;
		}
		try {
			const stopsRef = collection(db, "stops");
			const stopQuery = query(stopsRef, where("stopName", "==", stopPlace));
			const stopQuerySnapshot = await getDocs(stopQuery);

			let stopId = null;

			if (!stopQuerySnapshot.empty) {
				// Reuse existing stop document id
				stopId = stopQuerySnapshot.docs[0].id;
			} else {
				const stopPayload = {
					stopName: stopPlace,
					createdAt: serverTimestamp(),
				};
				if (selectedStop && selectedStop.center) {
					stopPayload.lat = selectedStop.center[1];
					stopPayload.lng = selectedStop.center[0];
				}
				const newStopDoc = await addDoc(stopsRef, stopPayload);
				stopId = newStopDoc.id;
			}

			const stopNo = stops.length + 1;
			const newStop = { stopId, stopNo, stopTime, stopName: stopPlace };
			setStops((prevStops) => [...prevStops, newStop]);
			setStopPlace("");
			setStopTime("");
			setStopSuggestions([]);
			setSelectedStop(null);
		} catch {
			setError("Failed to add stop. Please try again.");
		}
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setSuccess("");

		if (!currentUser || currentUser.role !== "admin") {
			setError("Only admins can add buses.");
			return;
		}

		if (
			!busNo ||
			!busName ||
			!driverName ||
			!capacity ||
			!startTime ||
			!endTime
		) {
			setError("Please fill all fields.");
			return;
		}

		try {
			setSubmitting(true);
			// 1) Create bus document
			const busesRef = collection(db, "buses");
			const busPayload = {
				busNo,
				busName,
				driverName,
				capacity: Number(capacity),
				startTime,
				endTime,
				stops,
				returnJourney: returnJourneyEnabled
					? { enabled: true, startTime: returnStartTime }
					: { enabled: false },
				createdAt: serverTimestamp(),
				createdBy: currentUser.email,
			};
			const newBus = await addDoc(busesRef, busPayload);

			// 2) Append busId to admin's `buses` array
			const usersRef = collection(db, "users");
			const adminQuery = query(
				usersRef,
				where("email", "==", currentUser.email)
			);
			const adminSnap = await getDocs(adminQuery);
			if (!adminSnap.empty) {
				const adminDocRef = doc(db, "users", adminSnap.docs[0].id);
				await updateDoc(adminDocRef, { buses: arrayUnion(newBus.id) });
			}

			setSuccess("Bus added successfully.");
			setBusNo("");
			setBusName("");
			setDriverName("");
			setCapacity("");
			setStartTime("");
			setEndTime("");
			setReturnJourneyEnabled(false);
			setReturnStartTime("");
			setStops([]);
		} catch (e) {
			setError("Failed to add bus. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<>
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				{error && <div className="text-red-600">{error}</div>}
				{success && <div className="text-green-700">{success}</div>}

				<label className="text-sm">Bus Number</label>
				<input
					type="text"
					value={busNo}
					onChange={(e) => setBusNo(e.target.value)}
					className="border rounded p-2"
					placeholder="e.g., 42A"
				/>

				<label className="text-sm">Bus Name</label>
				<input
					type="text"
					value={busName}
					onChange={(e) => setBusName(e.target.value)}
					className="border rounded p-2"
					placeholder="e.g., City Express"
				/>

				<label className="text-sm">Driver Name</label>
				<input
					type="text"
					value={driverName}
					onChange={(e) => setDriverName(e.target.value)}
					className="border rounded p-2"
					placeholder="e.g., Narendra Modi"
				/>

				<label className="text-sm">Capacity</label>
				<input
					type="number"
					value={capacity}
					onChange={(e) => setCapacity(e.target.value)}
					className="border rounded p-2"
					placeholder="e.g., 40"
				/>

				<label className="text-sm">Start Time</label>
				<input
					type="time"
					value={startTime}
					onChange={(e) => setStartTime(e.target.value)}
					className="border rounded p-2"
				/>

				<label className="text-sm">End Time</label>
				<input
					type="time"
					value={endTime}
					onChange={(e) => setEndTime(e.target.value)}
					className="border rounded p-2"
				/>

				<label className="inline-flex items-center gap-2">
					<input
						type="checkbox"
						checked={returnJourneyEnabled}
						onChange={(e) => setReturnJourneyEnabled(e.target.checked)}
					/>
					Enable Return Journey
				</label>

				{returnJourneyEnabled && (
					<>
						<label className="text-sm">Return Start Time</label>
						<input
							type="time"
							value={returnStartTime}
							onChange={(e) => setReturnStartTime(e.target.value)}
							className="border rounded p-2"
						/>
					</>
				)}

				<label className="text-sm">Stop Name</label>
				<input
					type="text"
					value={stopPlace}
					onChange={(e) => {
						setStopPlace(e.target.value);
						setSelectedStop(null);
					}}
					className="border rounded p-2"
					placeholder="e.g., Main Street"
					autoComplete="off"
				/>
				{stopSuggestions.length > 0 && (
					<ul className="border rounded max-h-40 overflow-auto bg-white shadow-md mt-1">
						{stopSuggestions.map((suggestion) => (
							<li
								key={suggestion.id}
								className="p-2 hover:bg-gray-200 cursor-pointer"
								onClick={() => {
									setStopPlace(suggestion.place_name);
									setSelectedStop(suggestion);
									setStopSuggestions([]);
								}}>
								{suggestion.place_name}
							</li>
						))}
					</ul>
				)}

				<label className="text-sm">Stop Time</label>
				<input
					type="time"
					value={stopTime}
					onChange={(e) => setStopTime(e.target.value)}
					className="border rounded p-2"
				/>

				<button
					type="button"
					onClick={handleAddStop}
					className="mt-1 bg-green-600 text-white rounded p-2 disabled:opacity-50">
					Add Stop
				</button>

				{stops.length > 0 && (
					<div className="mt-2">
						<h3 className="font-semibold">Added Stops:</h3>
						<table className="w-full border-collapse border border-gray-300">
							<thead>
								<tr>
									<th className="border border-gray-300 px-2 py-1 text-left">Stop No</th>
									<th className="border border-gray-300 px-2 py-1 text-left">Stop Name</th>
									<th className="border border-gray-300 px-2 py-1 text-left">Time</th>
								</tr>
							</thead>
							<tbody>
								{stops.map((stop) => (
									<tr key={stop.stopId}>
										<td className="border border-gray-300 px-2 py-1">{stop.stopNo}</td>
										<td className="border border-gray-300 px-2 py-1">{stop.stopName}</td>
										<td className="border border-gray-300 px-2 py-1">{stop.stopTime}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<button
					type="submit"
					disabled={submitting}
					className="mt-2 bg-blue-600 text-white rounded p-2 disabled:opacity-50">
					{submitting ? "Adding…" : "Add Bus"}
				</button>
			</form>
		</>
	);
};

export default AddBus;
