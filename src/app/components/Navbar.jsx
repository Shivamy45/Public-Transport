"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const Navbar = () => {
	const router = useRouter();
	const [currentUser, setCurrentUser] = useState(null);
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [isAdmin, setIsAdmin] = useState(false);

	// Check authentication status
	const checkAuthStatus = () => {
		try {
			const saved =
				typeof window !== "undefined"
					? localStorage.getItem("currentUser")
					: null;

			if (saved) {
				const userObj = JSON.parse(saved);
				setCurrentUser(userObj);
				setIsLoggedIn(true);
				setIsAdmin(userObj.role === "admin");
			} else {
				setCurrentUser(null);
				setIsLoggedIn(false);
				setIsAdmin(false);
			}
		} catch (err) {
			console.error("Error parsing currentUser:", err);
			setCurrentUser(null);
			setIsLoggedIn(false);
			setIsAdmin(false);
		}
	};

	// Initial auth check
	useEffect(() => {
		checkAuthStatus();
	}, []);

	// Listen for storage changes (when user logs in from another tab)
	useEffect(() => {
		const handleStorageChange = (e) => {
			if (e.key === "currentUser") {
				checkAuthStatus();
			}
		};

		window.addEventListener("storage", handleStorageChange);
		return () => window.removeEventListener("storage", handleStorageChange);
	}, []);

	// Custom event listener for same-tab login updates
	useEffect(() => {
		const handleAuthChange = () => {
			checkAuthStatus();
		};

		window.addEventListener("authStateChanged", handleAuthChange);
		return () =>
			window.removeEventListener("authStateChanged", handleAuthChange);
	}, []);

	const handleLogin = () => {
		router.push("/login");
	};

	const handleLogout = () => {
		try {
			if (typeof window !== "undefined") {
				localStorage.removeItem("currentUser");
				// Dispatch custom event to notify other components
				window.dispatchEvent(new Event("authStateChanged"));
			}
		} catch (err) {
			console.error("Error during logout:", err);
		}

		setCurrentUser(null);
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
		<div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-sm sticky top-0 w-full shadow-md z-50">
			<div className="flex items-center gap-4">
				<h1
					className="text-2xl font-bold cursor-pointer hover:text-yellow-500 transition-colors"
					onClick={handleHome}>
					TrackIt
				</h1>
				{isLoggedIn && currentUser && (
					<div className="hidden sm:block">
						<span className="text-sm text-gray-300">
							Welcome,{" "}
							<span className="font-medium text-white">
								{currentUser.name}
							</span>
							{isAdmin && (
								<span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
									Admin
								</span>
							)}
						</span>
					</div>
				)}
			</div>

			<nav>
				<ul className="flex items-center gap-6 lg:gap-10">
					<li
						onClick={handleBusesRoutes}
						className="cursor-pointer hover:text-blue-400 transition-colors text-sm lg:text-base">
						Bus Routes
					</li>
					<li
						onClick={handleStops}
						className="cursor-pointer hover:text-blue-400 transition-colors text-sm lg:text-base">
						Stops
					</li>
					<li
						onClick={handleNearbyBuses}
						className="cursor-pointer hover:text-blue-400 transition-colors text-sm lg:text-base">
						Nearby
					</li>
					{isAdmin && (
						<li
							onClick={handleAdminDashboard}
							className="cursor-pointer hover:text-blue-400 transition-colors text-sm lg:text-base font-medium">
							Dashboard
						</li>
					)}
				</ul>
			</nav>

			<div className="flex items-center gap-4">
				{isLoggedIn ? (
					<div className="flex items-center gap-3">
						{/* Mobile user info */}
						<div className="sm:hidden">
							<span className="text-xs text-gray-300">
								{currentUser?.name?.split(" ")[0]}
								{isAdmin && (
									<span className="ml-1 text-blue-400">
										👑
									</span>
								)}
							</span>
						</div>
						<button
							onClick={handleLogout}
							className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md transition-colors cursor-pointer text-sm lg:text-base">
							Logout
						</button>
					</div>
				) : (
					<button
						onClick={handleLogin}
						className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 lg:px-6 rounded-md transition-colors cursor-pointer text-sm lg:text-base">
						Login
					</button>
				)}
			</div>
		</div>
	);
};

export default Navbar;
