const apiUrl = "https://water-temp.prod.front.bkk.no/api/v1/temperatures"
const axios = require("axios")

/**
 * Fetches all water temperatures from the API
 * @returns List of objects
 */
const getWaterTemperatures = async () => {
    try {
        const response = await axios.get(apiUrl);
        return response?.data
    } catch (error) {
        console.error("An error ocurred while fetching water temperature", error);
    }
}

const getWaterTemperature = async (locationId) => {
    const waterTemperatureLocations = await getWaterTemperatures();
    return waterTemperatureLocations?.find(location => location.location_id === locationId)
}

exports.getWaterTemperatures = getWaterTemperatures;
exports.getWaterTemperature = getWaterTemperature;