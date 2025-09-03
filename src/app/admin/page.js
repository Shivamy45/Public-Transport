"use client";
import React, { useEffect, useState } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import BusInfo from "../components/BusInfo";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import MapView from "../components/MapView";
import AddBus from "../components/AddBus";

const page = () => {
	const [busIds, setBusIds] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showAddModal, setShowAddModal] = useState(false);

	useEffect(() => {
		const originalOverflow = document.body.style.overflow;
		const onKeyDown = (e) => {
			if (e.key === "Escape") setShowAddModal(false);
		};

		if (showAddModal) {
			document.body.style.overflow = "hidden";
			document.addEventListener("keydown", onKeyDown);
		} else {
			document.body.style.overflow = originalOverflow || "";
		}

		return () => {
			document.body.style.overflow = originalOverflow || "";
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [showAddModal]);

	useEffect(() => {
		const loadAdminBuses = async () => {
			try {
				setLoading(true);
				setError("");
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;
				if (!saved) {
					setError("Not authenticated.");
					setLoading(false);
					return;
				}
				const currentUser = JSON.parse(saved);
				if (currentUser?.role !== "admin") {
					setError("Only admins can access this page.");
					setLoading(false);
					return;
				}

				const usersRef = collection(db, "users");
				const q = query(
					usersRef,
					where("email", "==", currentUser.email)
				);
				const snap = await getDocs(q);
				if (snap.empty) {
					setBusIds([]);
					setLoading(false);
					return;
				}
				const adminDoc = snap.docs[0].data();
				setBusIds(Array.isArray(adminDoc?.buses) ? adminDoc.buses : []);
			} catch (_) {
				setError("Failed to load buses.");
			} finally {
				setLoading(false);
			}
		};

		loadAdminBuses();
	}, []);

	return (
		<div className="flex flex-col items-center mx-40 my-9">
			<h1 className="text-7xl">Admin Dashboard</h1>
			<div
				className="flex justify-center items-center border-1 border-white w-full p-4 mt-9 hover:bg-blue-500/10 cursor-pointer"
				onClick={() => setShowAddModal(true)}
				role="button"
				aria-label="Add bus">
				<FaPlus size={40} />
			</div>
			<div className="w-full mt-6">
				{error && (
					<div className="text-red-600 text-center">{error}</div>
				)}
				{loading ? (
					<div className="text-center">Loading buses…</div>
				) : busIds.length === 0 ? (
					<div className="text-center text-gray-400">
						No buses added yet.
					</div>
				) : (
					<div className="grid gap-4">
						{busIds.map((busId) => (
							<BusInfo key={busId} busId={busId} />
						))}
					</div>
				)}
			</div>
			<MapView />
			{showAddModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
					<div
						className="w-full max-w-2xl rounded-lg bg-white text-black p-6 relative mx-4 max-h-[80vh] overflow-y-auto focus:outline-none flex  flex-col"
						role="dialog"
						aria-modal="true"
						aria-labelledby="add-bus-title">
						<div className="flex w-full justify-between items-center mb-4">
							<h2
								id="add-bus-title"
								className="text-2xl font-semibold">
								Add Bus
							</h2>
							<button
								onClick={() => setShowAddModal(false)}
								className="cursor-pointer flexjustify-between items-center"
								aria-label="Close add bus form">
								<FaTimes size={30} />
							</button>
						</div>
						<AddBus />
					</div>
				</div>
			)}
		</div>
	);
};

export default page;
