"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LoginPage = () => {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		// Check if user is already logged in
		try {
			const saved =
				typeof window !== "undefined"
					? localStorage.getItem("currentUser")
					: null;
			if (saved) {
				const parsed = JSON.parse(saved);
				// Redirect based on role if already logged in
				if (parsed?.role === "admin") {
					router.replace("/admin");
				} else {
					router.replace("/");
				}
				return;
			}
		} catch (err) {
			console.error("Error checking existing session:", err);
		}
	}, [router]);

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErrorMessage("");

		if (!email || !password) {
			setErrorMessage("Please enter both email and password.");
			return;
		}

		try {
			setIsSubmitting(true);

			// Find user by email in Firestore
			const usersRef = collection(db, "users");
			const q = query(usersRef, where("email", "==", email));
			const snap = await getDocs(q);

			if (snap.empty) {
				setErrorMessage("No account found with this email address.");
				return;
			}

			// Get user data
			const userDoc = snap.docs[0].data();
			const storedPassword = userDoc?.password || "";

			if (storedPassword !== password) {
				setErrorMessage("Incorrect password. Please try again.");
				return;
			}

			// Success: save session and update global state immediately
			const sessionUser = {
				email: userDoc.email,
				role: userDoc.role,
				name: userDoc.name,
			};

			if (typeof window !== "undefined") {
				localStorage.setItem(
					"currentUser",
					JSON.stringify(sessionUser)
				);
				// Dispatch custom event to immediately notify other components
				window.dispatchEvent(new Event("authStateChanged"));
			}

			// Redirect based on role
			if (userDoc.role === "admin") {
				router.push("/admin");
			} else {
				router.push("/");
			}
		} catch (error) {
			console.error("Login error:", error);
			setErrorMessage(
				"Login failed. Please check your connection and try again."
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
			<div className="w-full max-w-md">
				<div className="bg-white rounded-xl shadow-lg p-8">
					{/* Header */}
					<div className="text-center mb-8">
						<h1 className="text-3xl font-bold text-gray-900 mb-2">
							Welcome Back
						</h1>
						<p className="text-gray-600">
							Sign in to your TrackIt account
						</p>
					</div>

					{/* Error Message */}
					{errorMessage && (
						<div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
							<div className="flex items-center">
								<svg
									className="h-5 w-5 text-red-400 mr-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span className="text-red-700 text-sm">
									{errorMessage}
								</span>
							</div>
						</div>
					)}

					{/* Login Form */}
					<form onSubmit={handleSubmit} className="space-y-6">
						<div>
							<label
								htmlFor="email"
								className="block text-sm font-medium text-gray-700 mb-2">
								Email Address
							</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								required
								className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-900"
								disabled={isSubmitting}
							/>
						</div>

						<div>
							<label
								htmlFor="password"
								className="block text-sm font-medium text-gray-700 mb-2">
								Password
							</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Your password"
								required
								className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-900"
								disabled={isSubmitting}
							/>
						</div>

						<button
							type="submit"
							disabled={isSubmitting}
							className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center">
							{isSubmitting ? (
								<>
									<div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
									Signing in...
								</>
							) : (
								"Sign In"
							)}
						</button>
					</form>

					{/* Footer */}
					<div className="mt-8 text-center">
						<p className="text-sm text-gray-600">
							Don't have an account?{" "}
							<Link
								href="/signup"
								className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
								Create one here
							</Link>
						</p>
					</div>

					{/* Demo Credentials (for development) */}
					<div className="mt-6 p-4 bg-gray-50 rounded-lg">
						<h3 className="text-xs font-medium text-gray-700 mb-2">
							Demo Credentials:
						</h3>
						<div className="text-xs text-gray-600 space-y-1">
							<p>
								<strong>Admin:</strong> admin@example.com /
								password123
							</p>
							<p>
								<strong>User:</strong> user@example.com /
								password123
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LoginPage;
