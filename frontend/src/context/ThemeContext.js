import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'; // Default to dark (trading terminal)
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'calm');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    // Cycle through: dark -> calm -> light -> high-contrast -> dark
    setTheme(prev => {
      if (prev === 'dark') return 'calm';
      if (prev === 'calm') return 'light';
      if (prev === 'light') return 'high-contrast';
      return 'dark';
    });
  };
  
  const setThemeMode = (mode) => {
    if (['dark', 'calm', 'light', 'high-contrast'].includes(mode)) {
      setTheme(mode);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};