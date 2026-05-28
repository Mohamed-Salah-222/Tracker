import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL ?? "https://tracker-u98r.onrender.com/api";

export const api = axios.create({
  baseURL,
});
