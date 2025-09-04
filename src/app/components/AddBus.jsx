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
	// Form state
	const [busNo, setBusNo] = useState("");
	const [busName, setBusName] = useState("");
	const [driverName, setDriverName] = useState("");
	const [capacity, setCapacity] = useState("");
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [returnJourneyEnabled, setReturnJourneyEnabled] = useState(false);
	const [returnStartTime, setReturnStartTime] = useState("");

	// Stop management state
	const [stops, setStops] = useState([]);
	const [stopPlace, setStopPlace] = useState("");
	const [stopTime, setStopTime] = useState("");
	const [stopSuggestions, setStopSuggestions] = useState([]);
	const [selectedStop, setSelectedStop] = useState(null);
	const [loadingSuggestions, setLoadingSuggestions] = useState(false);

	// Form submission state
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	// User state
	const [currentUser, setCurrentUser] = useState(null);

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
		}, 300); // Debounce API calls

		return () => clearTimeout(timeoutId);
	}, [stopPlace]);

	// Add stop to the route
	const handleAddStop = async () => {
		setError("");

		// Validation
		if (!stopPlace.trim()) {
			setError("Please enter a stop name.");
			return;
		}

		if (!stopTime) {
			setError("Please select a stop time.");
			return;
		}

		// Check for duplicate stop names
		if (
			stops.some(
				(stop) =>
					stop.stopName.toLowerCase() === stopPlace.toLowerCase()
			)
		) {
			setError("This stop has already been added.");
			return;
		}

		try {
			let coordinates = { lat: null, lng: null };

			// Get coordinates from selected suggestion or try to geocode
			if (selectedStop && selectedStop.center) {
				coordinates.lat = selectedStop.center[1];
				coordinates.lng = selectedStop.center[0];
			}

			// Create stop object - we'll store directly in bus document
			const newStop = {
				stopId: `stop_${Date.now()}_${Math.random()
					.toString(36)
					.substr(2, 9)}`,
				stopName: stopPlace.trim(),
				stopNo: stops.length + 1,
				stopTime,
				lat: coordinates.lat,
				lng: coordinates.lng,
			};

			setStops((prevStops) => [...prevStops, newStop]);

			// Reset form
			setStopPlace("");
			setStopTime("");
			setStopSuggestions([]);
			setSelectedStop(null);
		} catch (err) {
			console.error("Error adding stop:", err);
			setError("Failed to add stop. Please try again.");
		}
	};

	// Remove a stop
	const handleRemoveStop = (stopId) => {
		setStops((prevStops) => {
			const filtered = prevStops.filter((stop) => stop.stopId !== stopId);
			// Renumber the stops
			return filtered.map((stop, index) => ({
				...stop,
				stopNo: index + 1,
			}));
		});
	};

	// Move stop up/down in the order
	const handleMoveStop = (stopId, direction) => {
		setStops((prevStops) => {
			const currentIndex = prevStops.findIndex(
				(stop) => stop.stopId === stopId
			);
			const newIndex =
				direction === "up" ? currentIndex - 1 : currentIndex + 1;

			if (newIndex < 0 || newIndex >= prevStops.length) return prevStops;

			const newStops = [...prevStops];
			[newStops[currentIndex], newStops[newIndex]] = [
				newStops[newIndex],
				newStops[currentIndex],
			];

			// Renumber
			return newStops.map((stop, index) => ({
				...stop,
				stopNo: index + 1,
			}));
		});
	};

	// Submit the form
	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setSuccess("");

		// Validation
		if (!currentUser || currentUser.role !== "admin") {
			setError("Only admins can add buses.");
			return;
		}

		if (
			!busNo.trim() ||
			!busName.trim() ||
			!driverName.trim() ||
			!capacity ||
			!startTime ||
			!endTime
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

			// Create bus document with stops directly embedded
			const busPayload = {
				busNo: busNo.trim(),
				busName: busName.trim(),
				driverName: driverName.trim(),
				capacity: parseInt(capacity),
				currLoad: 0, // Initialize current load
				startTime,
				endTime,
				stops: stops, // Store stops directly in bus document
				returnJourney: returnJourneyEnabled
					? { enabled: true, startTime: returnStartTime }
					: { enabled: false },
				status: {
					current: "Not Started",
					currentStopIndex: 0,
					isReturn: false,
				},
				location: {
					lat: null,
					lng: null,
					lastUpdated: null,
				},
				createdAt: serverTimestamp(),
				createdBy: currentUser.email,
			};

			// Add to Firestore
			const busesRef = collection(db, "buses");
			const newBusDoc = await addDoc(busesRef, busPayload);

			// Update admin's buses array
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

			setSuccess("Bus added successfully!");

			// Reset form
			setBusNo("");
			setBusName("");
			setDriverName("");
			setCapacity("");
			setStartTime("");
			setEndTime("");
			setReturnJourneyEnabled(false);
			setReturnStartTime("");
			setStops([]);
		} catch (err) {
			console.error("Error adding bus:", err);
			setError("Failed to add bus. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
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
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								onChange={(e) => setDriverName(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								onChange={(e) => setCapacity(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="e.g., 40"
								min="1"
								required
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Start Time *
							</label>
							<input
								type="time"
								value={startTime}
								onChange={(e) => setStartTime(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								End Time *
							</label>
							<input
								type="time"
								value={endTime}
								onChange={(e) => setEndTime(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
									setReturnJourneyEnabled(e.target.checked)
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
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required={returnJourneyEnabled}
							/>
						</div>
					)}
				</div>

				{/* Route Stops Section */}
				<div className="bg-gray-50 p-6 rounded-lg">
					<h3 className="text-lg font-semibold mb-4 text-gray-900">
						Route Stops
					</h3>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Stop Name
							</label>
							<div className="relative">
								<input
									type="text"
									value={stopPlace}
									onChange={(e) => {
										setStopPlace(e.target.value);
										setSelectedStop(null);
									}}
									className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
												setSelectedStop(suggestion);
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
								onChange={(e) => setStopTime(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

							<div className="bg-white rounded-lg border overflow-hidden">
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead className="bg-gray-100">
											<tr>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Stop #
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Stop Name
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Time
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													GPS
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
													Actions
												</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{stops.map((stop, index) => (
												<tr
													key={stop.stopId}
													className="hover:bg-gray-50">
													<td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
														{stop.stopNo}
													</td>
													<td className="px-4 py-4 text-sm text-gray-900">
														{stop.stopName}
													</td>
													<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
														{stop.stopTime}
													</td>
													<td className="px-4 py-4 whitespace-nowrap text-sm">
														{stop.lat &&
														stop.lng ? (
															<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
																✓ Located
															</span>
														) : (
															<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
																! No GPS
															</span>
														)}
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
																	index === 0
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
											))}
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
							// Reset form
							setBusNo("");
							setBusName("");
							setDriverName("");
							setCapacity("");
							setStartTime("");
							setEndTime("");
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

				{/* Form Tips */}
				<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
					<h4 className="font-medium text-blue-900 mb-2">Tips:</h4>
					<ul className="text-sm text-blue-800 space-y-1">
						<li>• Add at least 2 stops to create a valid route</li>
						<li>
							• Use specific location names for better GPS
							accuracy
						</li>
						<li>
							• Arrange stops in the correct travel order using
							↑/↓ buttons
						</li>
						<li>
							• Return journey will reverse the stop order
							automatically
						</li>
					</ul>
				</div>
			</form>
		</div>
	);
};
export default AddBus;