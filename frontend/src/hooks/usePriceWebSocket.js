import { useState, useEffect, useRef, useCallback } from 'react';

export const usePriceWebSocket = () => {
  const [prices, setPrices] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscribedInstruments = useRef(new Set());

  const connect = useCallback(() => {
    // Get backend URL and convert to WebSocket URL
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const wsUrl = backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    
    try {
      wsRef.current = new WebSocket(`${wsUrl}/api/ws/prices`);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setStatusMessage('Live market data connected');
        
        // Resubscribe to instruments if any
        if (subscribedInstruments.current.size > 0) {
          const instruments = Array.from(subscribedInstruments.current);
          wsRef.current.send(JSON.stringify({
            action: 'subscribe',
            instruments
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'price_update') {
          setPrices(prev => ({
            ...prev,
            [data.instrument_key]: {
              ...data.data,
              _timestamp: Date.now() // Add frontend timestamp for animation
            }
          }));
        } else if (data.type === 'status') {
          setConnectionStatus(data.status);
          setStatusMessage(data.message);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        setStatusMessage('Connection error');
      };
      
      wsRef.current.onclose = () => {
        console.log('WebSocket closed');
        setConnectionStatus('disconnected');
        setStatusMessage('Disconnected - reconnecting...');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnectionStatus('error');
      setStatusMessage('Failed to connect');
    }
  }, []);

  const subscribe = useCallback((instrumentKeys) => {
    if (!Array.isArray(instrumentKeys)) {
      instrumentKeys = [instrumentKeys];
    }
    
    instrumentKeys.forEach(key => subscribedInstruments.current.add(key));
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        instruments: instrumentKeys
      }));
    }
  }, []);

  const unsubscribe = useCallback((instrumentKeys) => {
    if (!Array.isArray(instrumentKeys)) {
      instrumentKeys = [instrumentKeys];
    }
    
    instrumentKeys.forEach(key => subscribedInstruments.current.delete(key));
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        instruments: instrumentKeys
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    prices,
    connectionStatus,
    statusMessage,
    subscribe,
    unsubscribe
  };
};
