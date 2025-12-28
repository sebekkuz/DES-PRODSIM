import React from 'react';

const Header = ({ title }) => {
  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Separator dla mobile (opcjonalny, zachowany ze stylu) */}
      <div className="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true" />

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1 items-center">
            <h1 className="text-lg font-semibold leading-6 text-gray-900">
                {title || 'Panel'}
            </h1>
        </div>
        
        {/* Prawa strona pusta - brak "fejkowych" funkcji */}
      </div>
    </div>
  );
};

export default Header;