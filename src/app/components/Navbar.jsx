"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const Navbar = () => {
	const router = useRouter();
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [isAdmin, setIsAdmin] = useState(false);

	useEffect(
		() => {
			try {
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;

				if (saved) {
					const userObj = JSON.parse(saved);
					setIsLoggedIn(true);
					setIsAdmin(userObj.role === "admin");
				} else {
					setIsLoggedIn(false);
					setIsAdmin(false);
				}
			} catch (err) {
				console.error("Error parsing currentUser:", err);
				setIsLoggedIn(false);
				setIsAdmin(false);
			}
		},
		[]
	);

	const handleLogin = () => {
		router.push("/login");
	};
	const handleLogout = () => {
		try {
			if (typeof window !== "undefined") {
				localStorage.removeItem("currentUser");
			}
		} catch (_) {}
		setIsLoggedIn(false);
		setIsAdmin(false);
		router.push("/");
	};
	const handleBusesRoutes = () => {
		router.push("/buses-routes");
	};
	const handleHome = () => {
		router.push("/");
	};
	const handleStops = () => {
		router.push("/stops");
	};
	const handleNearbyBuses = () => {
		router.push("/nearby-buses");
	};
	const handleAdminDashboard = () => {
		router.push("/admin");
	};

	return (
		<>
			<div className="flex justify-between items-center p-4 bg-black/50 sticky top-0 w-full shadow-md z-50">
				<h1
					className="text-2xl font-bold cursor-pointer hover:text-yellow-500"
					onClick={handleHome}>
					TrackIt
				</h1>
				<ul className="flex items-center gap-10">
					<li
						onClick={handleBusesRoutes}
						className="cursor-pointer hover:text-blue-500">
						Buses Routes
					</li>
					<li
						onClick={handleStops}
						className="cursor-pointer hover:text-blue-500">
						Stops
					</li>
					<li
						onClick={handleNearbyBuses}
						className="cursor-pointer hover:text-blue-500">
						Nearby Buses
					</li>
					{isAdmin ? (
						<li
							onClick={handleAdminDashboard}
							className="cursor-pointer hover:text-blue-500">
							Admin Dashboard
						</li>
					) : (
						""
					)}
				</ul>
				<div className="flex items-center gap-4">
					<button
						onClick={isLoggedIn ? handleLogout : handleLogin}
						className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 cursor-pointer">
						{isLoggedIn ? "Logout" : "Login"}
					</button>
				</div>
			</div>
		</>
	);
};

export default Navbar;
