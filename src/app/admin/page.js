"use client";
import React, { useEffect, useState, useCallback } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import AdminBusPanel from "../components/AdminBusPanel";
import { db } from "@/lib/firebase";
import { collection, query, where, doc, onSnapshot, documentId } from "firebase/firestore";
import AddBus from "../components/AddBus";
import { useRouter } from "next/navigation";

const AdminPage = () => {
    const router = useRouter();
    const [busIds, setBusIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [runningCount, setRunningCount] = useState(0);
    const [totalStops, setTotalStops] = useState(0);

    // Check authentication and user role
    useEffect(() => {
        const saved = localStorage.getItem("currentUser");
        if (!saved) {
            router.push("/login");
            return;
        }
        const user = JSON.parse(saved);
        if (user?.role !== "admin") {
            router.push("/");
            return;
        }
        setCurrentUser(user);
    }, [router]);

    // Reusable function to load the admin's assigned bus IDs
    const loadAdminBusIds = useCallback(async () => {
        if (!currentUser?.email) return;
        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("email", "==", currentUser.email));
            // Using onSnapshot to listen for changes to the admin's bus list
            const unsubscribe = onSnapshot(q, (snapshot) => {
                if (snapshot.empty) {
                    setBusIds([]);
                    return;
                }
                const adminDoc = snapshot.docs[0].data();
                setBusIds(Array.isArray(adminDoc?.buses) ? adminDoc.buses : []);
            });
            return unsubscribe; // Return the listener cleanup function
        } catch (err) {
            console.error("Error loading admin bus list:", err);
            setError("Failed to load your bus list.");
        }
    }, [currentUser]);

    // Effect to load the initial list of bus IDs
    useEffect(() => {
        const unsubscribePromise = loadAdminBusIds();
        return () => {
            unsubscribePromise.then(unsubscribe => unsubscribe && unsubscribe());
        };
    }, [loadAdminBusIds]);


    // --- IMPROVED ---
    // This single effect now listens for REAL-TIME updates on all assigned buses
    // and calculates stats efficiently.
    useEffect(() => {
        if (!busIds || busIds.length === 0) {
            setLoading(false);
            setRunningCount(0);
            setTotalStops(0);
            return;
        }
        setLoading(true);

        // Firestore 'in' queries are limited to 30 items. 
        // For simplicity, we'll query the first 30. For more, you'd batch requests.
        const queryChunk = busIds.slice(0, 30);

        const busesRef = collection(db, "buses");
        const q = query(busesRef, where(documentId(), "in", queryChunk));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const busesData = snapshot.docs.map(doc => doc.data());

            const running = busesData.filter(bus => 
                bus?.status?.current?.toLowerCase() !== "not started" && 
                bus?.status?.current?.toLowerCase() !== "completed"
            ).length;

            const stopsCount = busesData.reduce(
                (sum, bus) => sum + (bus.stops?.length || 0), 0
            );

            setRunningCount(running);
            setTotalStops(stopsCount);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching bus stats:", err);
            setError("Failed to get real-time bus data.");
            setLoading(false);
        });

        // Cleanup the listener when busIds change or component unmounts
        return () => unsubscribe();
    }, [busIds]);


    const handleCloseModal = () => {
        setShowAddModal(false);
        // No need to manually refresh here anymore, onSnapshot will handle it automatically!
    };
    
    // Show loading state while checking authentication
    if (!currentUser) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-8">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
                    <p className="text-gray-600">Manage your bus fleet and routes in real-time</p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-2">{busIds.length}</div>
                        <div className="text-gray-600">Total Buses</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
                        <div className="text-3xl font-bold text-green-600 mb-2">{runningCount}</div>
                        <div className="text-gray-600">Active Now</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
                        <div className="text-3xl font-bold text-purple-600 mb-2">{totalStops}</div>
                        <div className="text-gray-600">Total Stops</div>
                    </div>
                </div>

                {/* Add Bus Button */}
                <div className="mb-8">
                    <div
                        className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                        onClick={() => setShowAddModal(true)}
                        role="button">
                        <FaPlus size={32} className="text-gray-400 mr-4" />
                        <p className="text-lg font-medium text-gray-600">Add New Bus</p>
                    </div>
                </div>

                {error && <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">{error}</div>}

                {/* Bus List */}
                <div className="space-y-6">
                    {loading ? (
                        <p className="text-center text-gray-500">Loading bus data...</p>
                    ) : busIds.length === 0 ? (
                        <div className="text-center py-12">
                            <h3 className="text-xl font-medium text-gray-900 mb-2">No buses found</h3>
                            <p className="text-gray-500">Get started by adding your first bus route.</p>
                        </div>
                    ) : (
                        busIds.map((busId) => <AdminBusPanel key={busId} busId={busId} />)
                    )}
                </div>
                
                {/* Add Bus Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                        <div className="w-full max-w-6xl rounded-xl bg-white p-8 relative max-h-[95vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6 pb-4 border-b">
                                <h2 className="text-3xl font-bold text-gray-900">Add New Bus</h2>
                                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                    <FaTimes size={24} className="text-gray-600" />
                                </button>
                            </div>
                            <AddBus onSuccess={handleCloseModal} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPage;