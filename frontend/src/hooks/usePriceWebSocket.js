import { useState, useEffect, useRef, useCallback } from 'react';

export const usePriceWebSocket = () => {
  const [prices, setPrices] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscribedInstruments = useRef(new Set());
  const isConnectingRef = useRef(false);  // ← guard against duplicate connections

  const connect = useCallback(() => {
    // Don't open a new connection if one already exists or is being created
    if (
      isConnectingRef.current ||
      (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) ||
      (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    isConnectingRef.current = true;

    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const wsUrl = backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    try {
      wsRef.current = new WebSocket(`${wsUrl}/api/ws/prices`);

      wsRef.current.onopen = () => {
        isConnectingRef.current = false;
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setStatusMessage('Live market data connected');

        // Resubscribe to all tracked instruments on reconnect
        if (subscribedInstruments.current.size > 0) {
          const instruments = Array.from(subscribedInstruments.current);
          wsRef.current.send(JSON.stringify({
            action: 'subscribe',
            instruments
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'price_update') {
            setPrices(prev => ({
              ...prev,
              [data.instrument_key]: {
                ...data.data,
                _timestamp: Date.now()
              }
            }));
          } else if (data.type === 'status') {
            setConnectionStatus(data.status);
            setStatusMessage(data.message);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      wsRef.current.onerror = (error) => {
        isConnectingRef.current = false;
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        setStatusMessage('Connection error');
      };

      wsRef.current.onclose = () => {
        isConnectingRef.current = false;
        console.log('WebSocket closed');
        setConnectionStatus('disconnected');
        setStatusMessage('Disconnected - reconnecting...');

        // Clear any existing reconnect timer before setting a new one
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

    } catch (error) {
      isConnectingRef.current = false;
      console.error('Failed to connect WebSocket:', error);
      setConnectionStatus('error');
      setStatusMessage('Failed to connect');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Clean up on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Set onclose to null so cleanup doesn't trigger reconnect
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      isConnectingRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    prices,
    connectionStatus,
    statusMessage,
    subscribe,
    unsubscribe
  };
};