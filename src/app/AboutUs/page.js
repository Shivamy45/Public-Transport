'use client';
import React from "react";
import { Users } from "lucide-react"; // Use a valid Lucide icon

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="flex items-center mb-6">
          <Users className="w-10 h-10 text-blue-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-800">About Us</h1>
        </div>
        <p className="text-gray-600 mb-6">
          Welcome to Public Transport! We are dedicated to making your daily commute easier, faster, and more reliable. Our platform connects you with real-time transit information, route planning, and updates to ensure a smooth journey.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center">
            {/* Example Lucide icon */}
            <svg className="w-8 h-8 text-blue-500 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2v20m10-10H2" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Our Mission</h2>
            <p className="text-gray-500 text-center">
              To empower commuters with accurate, up-to-date transit information and promote sustainable urban mobility.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center">
            {/* Example Lucide icon */}
            <svg className="w-8 h-8 text-green-500 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l2 2 4-4" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Why Choose Us?</h2>
            <p className="text-gray-500 text-center">
              We combine technology and user feedback to deliver a seamless public transport experience for everyone.
            </p>
          </div>
        </div>
        <div className="mt-10 text-center">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Contact Us</h3>
          <p className="text-gray-600">
            Have questions or suggestions? Reach out at <a href="mailto:support@publictransport.com" className="text-blue-600 underline">support@publictransport.com</a>
          </p>
        </div>
      </div>
    </div>
    );
}