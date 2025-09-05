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
    <>
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-400 text-white px-6 py-2 rounded-full font-bold text-lg">
              TransitGo
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href="/AboutUs" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">About Us</a>
            <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">TransitGo Ads</a>
            <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Safety</a>
            <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Blog</a>
            <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Contact Us</a>
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
		</header>
		</>
	);
};

export default Navbar;
