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
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [currentUser, setCurrentUser] = useState(null);

	useEffect(() => {
		try {
			const saved =
				typeof window !== "undefined"
					? localStorage.getItem("currentUser")
					: null;
			if (saved) {
				const parsed = JSON.parse(saved);
				isLoggedIn(true);
				// Immediately redirect based on role if already logged in
				if (parsed?.role === "admin") {
					router.replace("/admin");
				} else {
					router.replace("/");
				}
				return;
			}
		} catch (_) {
			// ignore
		}
	}, []);

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
				setErrorMessage("No email found");
				return;
			}

			// Assuming unique emails, take the first
			const userDoc = snap.docs[0].data();
			const storedPassword = userDoc?.password || "";

			if (storedPassword !== password) {
				setErrorMessage("Incorrect password");
				return;
			}

			// Success: save session and redirect
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
			}
			setCurrentUser(sessionUser);
			setIsLoggedIn(true);

			if (userDoc.role === "admin") {
				router.push("/admin");
			} else {
				router.push("/");
			}
		} catch (error) {
			setErrorMessage("Login failed. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div
			style={{
				maxWidth: "420px",
				margin: "40px auto",
				padding: "24px",
				border: "1px solid #e5e7eb",
				borderRadius: "8px",
			}}>
			<h1
				style={{
					fontSize: "20px",
					fontWeight: 600,
					marginBottom: "16px",
				}}>
				Login
			</h1>

			{errorMessage && (
				<div style={{ marginBottom: "12px", color: "#b91c1c" }}>
					{errorMessage}
				</div>
			)}

			<form onSubmit={handleSubmit}>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "12px",
					}}>
					<label htmlFor="email" style={{ fontSize: "14px" }}>
						Email
					</label>
					<input
						id="email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="you@example.com"
						required
						style={{
							padding: "10px 12px",
							border: "1px solid #d1d5db",
							borderRadius: "6px",
						}}
					/>

					<label
						htmlFor="password"
						style={{ fontSize: "14px", marginTop: "8px" }}>
						Password
					</label>
					<input
						id="password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Your password"
						required
						style={{
							padding: "10px 12px",
							border: "1px solid #d1d5db",
							borderRadius: "6px",
						}}
					/>

					<button
						type="submit"
						disabled={isSubmitting}
						style={{
							marginTop: "16px",
							padding: "10px 12px",
							backgroundColor: isSubmitting
								? "#9ca3af"
								: "#111827",
							color: "white",
							border: "none",
							borderRadius: "6px",
							cursor: isSubmitting ? "not-allowed" : "pointer",
						}}>
						{isSubmitting ? "Logging in…" : "Log In"}
					</button>
				</div>
			</form>
			<p className="text-center text-sm mt-4">
				Don't have an account?{" "}
				<Link href="/signup" className="text-blue-500">
					Sign up
				</Link>
			</p>
		</div>
	);
};

export default LoginPage;
