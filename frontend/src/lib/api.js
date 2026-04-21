import axios from "axios";

const isProd = window.location.hostname.includes("railway.app");
const PROD_BACKEND = "https://ogretmencantasi-production.up.railway.app";

const BACKEND_URL = isProd 
  ? PROD_BACKEND 
  : (process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || "http://localhost:8000");

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});
