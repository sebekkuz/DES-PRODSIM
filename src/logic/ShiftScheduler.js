// src/logic/ShiftScheduler.js
'use strict';

export class ShiftScheduler {
    constructor(shiftsConfig = {}) {
        this.shiftsConfig = shiftsConfig;
    }

    updateConfig(shiftsConfig) {
        this.shiftsConfig = shiftsConfig || {};
    }

    // Sprawdza, czy w danej godzinie (timeHour od startu symulacji) zakład pracuje
    isWorkingTime(timeHour) {
        const dayIndex = Math.floor(timeHour / 24); 
        const hourOfDay = timeHour % 24; 
        
        if (!this.shiftsConfig || Object.keys(this.shiftsConfig).length === 0) return true; 

        let isWorking = false;
        Object.values(this.shiftsConfig).forEach(shift => {
            if (!shift.active) return;
            const currentDayOfWeek = dayIndex % 7;
            if (currentDayOfWeek >= shift.days) return; 

            const [sH, sM] = shift.start.split(':').map(Number);
            const [eH, eM] = shift.end.split(':').map(Number);
            const startVal = sH + sM/60;
            const endVal = eH + eM/60;

            if (endVal > startVal) {
                // Zmiana dzienna (np. 06:00 - 14:00)
                if (hourOfDay >= startVal && hourOfDay < endVal) isWorking = true;
            } else {
                // Zmiana nocna przechodząca przez północ (np. 22:00 - 06:00)
                if (hourOfDay >= startVal || hourOfDay < endVal) isWorking = true;
            }
        });
        return isWorking;
    }

    // Oblicza, kiedy zadanie trwające 'durationHours' się zakończy, uwzględniając przerwy w pracy
    calculateCompletionTime(startTime, durationHours) {
        let remainingWork = durationHours;
        let cursor = startTime;
        const MAX_ITERATIONS = 15000; // Zabezpieczenie przed pętlą nieskończoną
        let iterations = 0;

        // 1. Przesuń kursor do najbliższego momentu pracy (jeśli startujemy w wolne)
        while (!this.isWorkingTime(cursor) && iterations < 168) { // Max tydzień szukania
             const timeToNextHour = Math.ceil(cursor) - cursor;
             cursor += (timeToNextHour === 0 ? 1.0 : timeToNextHour);
             iterations++;
        }
        
        iterations = 0;
        // 2. Wykonuj pracę
        while (remainingWork > 0.0001 && iterations < MAX_ITERATIONS) {
            iterations++;
            if (this.isWorkingTime(cursor)) {
                // Jesteśmy w godzinach pracy
                const timeToNextHour = Math.ceil(cursor) - cursor;
                const step = (timeToNextHour === 0) ? 1.0 : timeToNextHour; 
                
                const workToDo = Math.min(remainingWork, step);
                cursor += workToDo;
                remainingWork -= workToDo;
            } else {
                // Jesteśmy w czasie wolnym - przeskocz do następnej pełnej godziny
                const timeToNextHour = Math.ceil(cursor) - cursor;
                cursor += (timeToNextHour === 0 ? 1.0 : timeToNextHour);
            }
        }
        return cursor;
    }
    
    // Oblicza ile roboczogodzin (płatnych) wystąpiło w danym okresie symulacji
    calculateWorkingHoursDuration(totalDuration) {
        let paidHours = 0;
        for (let t = 0; t < totalDuration; t++) {
            if (this.isWorkingTime(t)) paidHours += 1;
        }
        return paidHours;
    }

    // Helper do konwersji dat
    getHourDifference(startDateStr, endDateStr) {
        try {
            const parseDate = (str) => {
                const parts = str.split('-');
                if (parts[0].length === 2) return new Date(parts[2], parts[1] - 1, parts[0]);
                return new Date(parts[0], parts[1] - 1, parts[2]);
            };
            const start = parseDate(startDateStr);
            const end = parseDate(endDateStr);
            const diffMs = end - start;
            return (diffMs / (1000 * 60 * 60)); 
        } catch (e) { return 0; }
    }
}