export const formatDistanceKm = (distanceKm) => {
	if (distanceKm == null || isNaN(distanceKm)) return "-";
	if (distanceKm < 0.5) {
		const meters = Math.round(distanceKm * 1000);
		return `${meters} m`;
	}
	return `${distanceKm.toFixed(2)} km`;
};
