import axios from "axios";

export const api = axios.create({
  baseURL: "https://tracker-u98r.onrender.com/api",
});
