"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
	const router = useRouter();
	const [currentUser, setCurrentUser] = useState(null);
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	const [pickupLocation, setPickupLocation] = useState('');
	const [dropLocation, setDropLocation] = useState('');

	useEffect(() => {
		const checkAuth = () => {
			try {
				const saved =
					typeof window !== "undefined"
						? localStorage.getItem("currentUser")
						: null;
				if (saved) {
					const user = JSON.parse(saved);
					setCurrentUser(user);
					setIsLoggedIn(true);
				}
			} catch (err) {
				console.error("Error checking auth:", err);
			}
		};

		checkAuth();

		// Listen for auth changes
		const handleAuthChange = () => {
			checkAuth();
		};

		window.addEventListener("authStateChanged", handleAuthChange);
		return () =>
			window.removeEventListener("authStateChanged", handleAuthChange);
	}, []);
	const handleBookRide = () => {
		router.push("/book-ride");
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
			<main className="relative overflow-hidden">
				{/* Background Pattern */}
				<div className="absolute inset-0 opacity-5">
					<div className="absolute top-20 left-10 w-32 h-32 bg-blue-400 rounded-full"></div>
					<div className="absolute top-40 right-20 w-24 h-24 bg-cyan-400 rounded-full"></div>
					<div className="absolute bottom-40 left-1/4 w-20 h-20 bg-emerald-400 rounded-full"></div>
					<div className="absolute bottom-20 right-1/3 w-16 h-16 bg-blue-400 rounded-full"></div>
				</div>

				<div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
					{/* Main Heading */}
					<h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-12 leading-tight">
						India Moves On{' '}
						<span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
							TransitGo!
						</span>
					</h1>

					{/* Booking Form */}
					<div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-auto border border-gray-100">
						<div className="space-y-4">
							{/* Pickup Location */}
							<div className="relative">
								<div className="absolute left-4 top-1/2 transform -translate-y-1/2">
									<div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
								</div>
								<input
									type="text"
									placeholder="Enter Pickup Location"
									value={pickupLocation}
									onChange={(e) => setPickupLocation(e.target.value)}
									className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder-gray-500 transition-all"
								/>
							</div>

							{/* Drop Location */}
							<div className="relative">
								<div className="absolute left-4 top-1/2 transform -translate-y-1/2">
									<div className="w-3 h-3 bg-red-500 rounded-full"></div>
								</div>
								<input
									type="text"
									placeholder="Enter Drop Location"
									value={dropLocation}
									onChange={(e) => setDropLocation(e.target.value)}
									className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder-gray-500 transition-all"
								/>
							</div>

							{/* Book Ride Button */}
							<button className="w-full bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all transform hover:scale-105 shadow-lg hover:shadow-xl" onClick={handleBookRide}>
								Book Ride
							</button>
						</div>
					</div>

				</div>


			</main>
			{/* Hero Section */}
			<div className="relative overflow-hidden bg-white">
				<div className="max-w-7xl mx-auto">
					<div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
						<svg
							className="hidden lg:block absolute right-0 inset-y-0 h-full w-48 text-white transform translate-x-1/2"
							fill="currentColor"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							aria-hidden="true">
							<polygon points="50,0 100,0 50,100 0,100" />
						</svg>

						<main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
							<div className="sm:text-center lg:text-left">
								<h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
									<span className="block xl:inline">
										Track your
									</span>{" "}
									<span className="block text-blue-600 xl:inline">
										public transport
									</span>
								</h1>
								<p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
									Real-time bus tracking, route planning, and
									schedule management. Find buses near you,
									plan your journey, and never miss your ride
									again.
								</p>

								{isLoggedIn && currentUser ? (
									<div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
										<p className="text-green-800">
											Welcome back,{" "}
											<span className="font-semibold">
												{currentUser.name}
											</span>
											!
											{currentUser.role === "admin" && (
												<span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
													Admin
												</span>
											)}
										</p>
									</div>
								) : (
									<div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
										<div className="rounded-md shadow">
											<Link
												href="/login"
												className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10 transition-colors">
												Get Started
											</Link>
										</div>
										<div className="mt-3 sm:mt-0 sm:ml-3">
											<Link
												href="/buses-routes"
												className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 md:py-4 md:text-lg md:px-10 transition-colors">
												Browse Routes
											</Link>
										</div>
									</div>
								)}
							</div>
						</main>
					</div>
				</div>
				<div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
					<div className="h-56 w-full bg-gradient-to-r from-blue-400 to-blue-600 sm:h-72 md:h-96 lg:w-full lg:h-full flex items-center justify-center">
						<div className="text-center text-white">
							<div className="text-8xl mb-4">🚌</div>
							<p className="text-xl font-medium">
								Real-time Tracking
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Quick Actions */}
			<div className="py-12 bg-gray-50">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<h2 className="text-3xl font-extrabold text-gray-900">
							Quick Actions
						</h2>
						<p className="mt-4 text-lg text-gray-600">
							Everything you need to manage your public transport
						</p>
					</div>

					<div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{quickActions.map((action, index) => (
							<Link
								key={index}
								href={action.href}
								className="group relative bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 hover:border-gray-300">
								<div
									className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${action.color} text-white text-2xl mb-4`}>
									{action.icon}
								</div>
								<h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
									{action.title}
								</h3>
								<p className="mt-2 text-sm text-gray-500">
									{action.description}
								</p>
								<div className="mt-4 text-blue-600 text-sm font-medium group-hover:text-blue-700">
									Learn more →
								</div>
							</Link>
						))}
					</div>
				</div>
			</div>

			{/* Features */}
			<div className="py-12 bg-white">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<h2 className="text-3xl font-extrabold text-gray-900">
							Key Features
						</h2>
						<p className="mt-4 text-lg text-gray-600">
							Comprehensive public transport management
						</p>
					</div>

					<div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
						<div className="text-center">
							<div className="text-4xl mb-4">📱</div>
							<h3 className="text-lg font-medium text-gray-900">
								Real-time Updates
							</h3>
							<p className="mt-2 text-sm text-gray-500">
								Get live bus locations and arrival times
							</p>
						</div>
						<div className="text-center">
							<div className="text-4xl mb-4">🗺️</div>
							<h3 className="text-lg font-medium text-gray-900">
								Interactive Maps
							</h3>
							<p className="mt-2 text-sm text-gray-500">
								Visual route planning with GPS integration
							</p>
						</div>
						<div className="text-center">
							<div className="text-4xl mb-4">⏰</div>
							<h3 className="text-lg font-medium text-gray-900">
								Smart Scheduling
							</h3>
							<p className="mt-2 text-sm text-gray-500">
								Automated timetables and schedule management
							</p>
						</div>
						<div className="text-center">
							<div className="text-4xl mb-4">👥</div>
							<h3 className="text-lg font-medium text-gray-900">
								Admin Dashboard
							</h3>
							<p className="mt-2 text-sm text-gray-500">
								Complete fleet management for administrators
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* CTA Section */}
			<div className="bg-blue-600">
				<div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
					<h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
						<span className="block">Ready to get started?</span>
						<span className="block text-blue-200">
							Join TrackIt today.
						</span>
					</h2>
					<div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
						<div className="inline-flex rounded-md shadow">
							<Link
								href={
									isLoggedIn
										? currentUser?.role === "admin"
											? "/admin"
											: "/buses-routes"
										: "/signup"
								}
								className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 transition-colors">
								{isLoggedIn
									? currentUser?.role === "admin"
										? "Go to Dashboard"
										: "Browse Routes"
									: "Sign Up Free"}
							</Link>
						</div>
						<div className="ml-3 inline-flex rounded-md shadow">
							<Link
								href="/buses-routes"
								className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-500 hover:bg-blue-400 transition-colors">
								View Demo
							</Link>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
