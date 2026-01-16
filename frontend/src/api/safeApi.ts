import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { useBackendStore } from '../store/backendStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors gracefully
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't throw - let the wrapper handle it
    return Promise.reject(error);
  }
);

// Mock data generators
const generateMockData = (endpoint: string): any => {
  const now = new Date();
  
  if (endpoint.includes('/predictions')) {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `mock-${i}`,
      machine_id: 'mock-machine',
      sensor_id: 'mock-sensor',
      timestamp: new Date(now.getTime() - i * 60000).toISOString(),
      score: 0.5 + Math.random() * 0.3,
      confidence: 0.7 + Math.random() * 0.2,
      status: i % 3 === 0 ? 'critical' : i % 3 === 1 ? 'warning' : 'normal',
      prediction: i % 3 === 0 ? 'anomaly' : 'normal',
    }));
  }
  
  if (endpoint.includes('/dashboard/overview')) {
    return {
      machines: { total: 5, online: 4 },
      alarms: { active: 2 },
      sensors: { total: 20 },
      predictions: { last_24h: 150 },
    };
  }
  
  if (endpoint.includes('/machines')) {
    return Array.from({ length: 5 }, (_, i) => ({
      id: `mock-machine-${i}`,
      name: `Machine ${i + 1}`,
      location: `Location ${i + 1}`,
      status: i % 2 === 0 ? 'active' : 'inactive',
      machine_type: 'Motor',
    }));
  }
  
  if (endpoint.includes('/ai/status')) {
    return {
      status: 'unavailable',
      model_loaded: false,
      message: 'Backend offline - using fallback data',
    };
  }
  
  if (endpoint.includes('/mqtt/status')) {
    return {
      connected: false,
      broker: { host: 'unknown', port: 1883 },
      consumer: { connected: false },
    };
  }
  
  return null;
};

// Safe API wrapper - never throws errors
export const safeApi = {
  get: async <T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<{ fallback: boolean; data: T | null; error?: string }> => {
    const backendStatus = useBackendStore.getState().status;
    
    // If backend is offline, return fallback data immediately
    if (backendStatus === 'offline') {
      const mockData = generateMockData(url);
      return { fallback: true, data: mockData as T };
    }
    
    try {
      const response: AxiosResponse<T> = await axiosInstance.get(url, {
        ...config,
        timeout: config?.timeout || 5000,
      });
      return { fallback: false, data: response.data };
    } catch (error: any) {
      // On error, return fallback data
      const mockData = generateMockData(url);
      return { fallback: true, data: mockData as T, error: error.message };
    }
  },
  
  post: async <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<{ fallback: boolean; data: T | null; error?: string }> => {
    const backendStatus = useBackendStore.getState().status;
    
    if (backendStatus === 'offline') {
      return { fallback: true, data: null, error: 'Backend offline' };
    }
    
    try {
      const response: AxiosResponse<T> = await axiosInstance.post(url, data, {
        ...config,
        timeout: config?.timeout || 5000,
      });
      return { fallback: false, data: response.data };
    } catch (error: any) {
      return { fallback: true, data: null, error: error.message };
    }
  },
  
  put: async <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<{ fallback: boolean; data: T | null; error?: string }> => {
    const backendStatus = useBackendStore.getState().status;
    
    if (backendStatus === 'offline') {
      return { fallback: true, data: null, error: 'Backend offline' };
    }
    
    try {
      const response: AxiosResponse<T> = await axiosInstance.put(url, data, config);
      return { fallback: false, data: response.data };
    } catch (error: any) {
      return { fallback: true, data: null, error: error.message };
    }
  },
  
  delete: async <T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<{ fallback: boolean; data: T | null; error?: string }> => {
    const backendStatus = useBackendStore.getState().status;
    
    if (backendStatus === 'offline') {
      return { fallback: true, data: null, error: 'Backend offline' };
    }
    
    try {
      const response: AxiosResponse<T> = await axiosInstance.delete(url, config);
      return { fallback: false, data: response.data };
    } catch (error: any) {
      return { fallback: true, data: null, error: error.message };
    }
  },
};

export default safeApi;

