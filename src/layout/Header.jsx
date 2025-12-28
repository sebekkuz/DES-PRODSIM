import React from 'react';

const Header = ({ title }) => {
  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shadow-sm z-10">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-text-main">
          {title || 'Panel Sterowania'}
        </h2>
      </div>
      <div className="flex items-center space-x-4">
        {/* Placeholder na przyszłe awatary lub statusy */}
        <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-xs text-text-muted">
          U
        </div>
      </div>
    </header>
  );
};

export default Header;