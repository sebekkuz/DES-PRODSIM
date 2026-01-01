// src/logic/simulation_models.js
'use strict';

/**
 * Reprezentuje pojedynczą część (produkt) przepływającą przez system.
 */
export class Part {
    /**
     * @param {number|string} id Unikalne ID części
     * @param {string} orderId ID zlecenia
     * @param {'PARENT'|'CHILD'} partType Typ części
     * @param {string} partCode Kod produktu (np. 'M1')
     * @param {string} size Rozmiar/Wariant (np. 'VS021')
     * @param {Array} routing Tablica operacji
     * @param {Array} childrenBOM Lista podkomponentów (dla typu PARENT)
     * @param {number} creationTime Czas wejścia do systemu (h)
     */
    constructor(id, orderId, partType, partCode, size, routing, childrenBOM, creationTime) {
        this.id = `part_${id}`;
        this.orderId = orderId;
        this.type = partType;
        this.code = partCode;
        this.size = size;
        this.routing = routing || [];
        this.routingStep = 0; // Indeks aktualnej operacji w routingu
        
        // Struktura BOM
        this.childrenBOM = childrenBOM || []; 
        this.attachedChildren = []; // Fizycznie zmontowane dzieci
        
        // Stan symulacji
        this.state = 'CREATED'; 
        this.currentLocation = null; 
        
        // Statystyki i KPI
        this.creationTime = creationTime;
        this.finishTime = null;
        this.lastStateChangeTime = creationTime;
        this.dueDate = null;

        // Liczniki czasu (akumulowane)
        this.totalWaitTime = 0;
        this.totalTransportTime = 0;
        this.totalProcessingTime = 0;
        this.totalBlockedTime = 0;

        // Koszty
        this.materialCost = partType === 'PARENT' ? 100 : 20; // Przykładowe wartości
    }
    
    /**
     * Aktualizuje stan części i zlicza statystyki czasu.
     * @param {string} newState Nowy status (np. 'PROCESSING', 'IDLE')
     * @param {number} currentTime Aktualny czas symulacji
     */
    updateState(newState, currentTime) {
        const duration = Math.max(0, currentTime - this.lastStateChangeTime);
        
        switch (this.state) {
            case 'PROCESSING': 
                this.totalProcessingTime += duration; 
                break;
            case 'IN_TRANSPORT':
            case 'WAITING_FOR_WORKER_TRAVEL': 
                this.totalTransportTime += duration; 
                break;
            case 'IDLE_IN_BUFFER':
            case 'IDLE_AT_STATION':
            case 'WAITING_FOR_WORKER':
            case 'WAITING_FOR_TOOL': 
                this.totalWaitTime += duration; 
                break;
            case 'BLOCKED': 
                this.totalBlockedTime += duration; 
                break;
        }
        
        this.state = newState;
        this.lastStateChangeTime = currentTime;
        
        if (newState === 'FINISHED' || newState === 'SCRAPPED') {
            this.finishTime = currentTime;
        }
    }

    /**
     * Pobiera obiekt następnej operacji z przypisanej marszruty.
     * @returns {Object|null} Obiekt operacji lub null, jeśli koniec.
     */
    getNextOperation() {
        if (this.routingStep < this.routing.length) {
            return this.routing[this.routingStep];
        }
        return null; 
    }
}

/**
 * Klasa zarządzająca pulą zasobów (Pracownicy, Narzędzia).
 */
export class ResourcePool {
    /**
     * @param {string} name Nazwa puli (np. "Monterzy")
     * @param {number} capacity Całkowita liczba zasobów
     * @param {number} speed Współczynnik prędkości (domyślnie 1.0)
     * @param {Object} engine Referencja do silnika (do logowania)
     * @param {number} costPerHour Koszt pracy za godzinę (opcjonalne)
     */
    constructor(name, capacity, speed, engine, costPerHour = 0) {
        this.name = name;
        this.capacity = capacity;
        this.speed = speed || 1.0;
        this.costPerHour = costPerHour;
        
        this.available = capacity;
        this.waitQueue = []; // Kolejka: { entity: Part, count: number }
        this.engine = engine; 
        
        this.totalBusyTimeSeconds = 0; // Licznik czasu zajętości (do KPI utylizacji)

        // Mock loggera, jeśli brak silnika
        if (!this.engine || !this.engine.logMessage) {
            this.engine = { logMessage: () => {} };
        }
    }

    /**
     * Próba pobrania zasobu.
     * @param {Part} entity Obiekt proszący o zasób
     * @param {number} count Liczba wymaganych jednostek
     * @returns {boolean} True jeśli przyznano, False jeśli dodano do kolejki
     */
    request(entity, count) {
        if (count > this.capacity) {
             // Zabezpieczenie: żądanie niemożliwe do spełnienia
             return false;
        }
        
        if (this.available >= count) {
            this.available -= count;
            return true;
        } else {
            // Unikanie duplikatów w kolejce
            const exists = this.waitQueue.some(item => item.entity.id === entity.id);
            if (!exists) {
                this.waitQueue.push({ entity, count });
            }
            return false;
        }
    }

    /**
     * Zwolnienie zasobu.
     * @param {Part} entityReleasing Obiekt zwalniający
     * @param {number} count Liczba zwalnianych jednostek
     * @param {number} busyTimeDuration Czas trwania ostatniej operacji (h) - do statystyk
     * @returns {Part|null} Odblokowany obiekt z kolejki lub null
     */
    release(entityReleasing, count, busyTimeDuration = 0) {
        this.available += count;
        if (this.available > this.capacity) this.available = this.capacity; // Safety clamp

        // Aktualizacja statystyk zajętości
        // busyTimeDuration (h) * count (osób) * 3600 (s/h)
        this.totalBusyTimeSeconds += (busyTimeDuration * 3600 * count);

        // Sprawdzenie kolejki oczekujących
        if (this.waitQueue.length > 0) {
            const nextInQueue = this.waitQueue[0];
            
            if (this.available >= nextInQueue.count) {
                this.available -= nextInQueue.count;
                const unblocked = this.waitQueue.shift();
                return unblocked.entity; 
            }
        }
        return null;
    }
}