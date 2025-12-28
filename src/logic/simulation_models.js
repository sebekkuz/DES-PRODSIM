// simulation_models.js
'use strict';

/**
 * Klasa reprezentująca pojedynczą część (produkt) w systemie.
 */
export class Part {
    constructor(id, orderId, partType, partCode, size, routing, childrenBOM, creationTime) {
        this.id = `part_${id}`;
        this.orderId = orderId;
        this.type = partType;   // 'PARENT' (Obudowa) lub 'CHILD' (Funkcja)
        this.code = partCode;   // np. 'M1', 'F'
        this.size = size;       // np. 'VS021'
        this.routing = routing || []; // Lista operacji do wykonania
        this.routingStep = 0;   // Indeks aktualnej operacji
        
        // Struktura BOM (dla montażu)
        this.childrenBOM = childrenBOM || []; 
        this.attachedChildren = []; 
        
        // Stan
        this.state = 'CREATED'; 
        this.currentLocation = null; 
        
        // Statystyki
        this.creationTime = creationTime;
        this.totalWaitTime = 0;
        this.totalTransportTime = 0;
        this.totalProcessingTime = 0;
    }
    
    // Zwraca obiekt następnej operacji z marszruty lub null
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
    constructor(name, capacity, speed, engine) {
        this.name = name;
        this.capacity = capacity;
        this.speed = speed || 1.0; // Domyślna prędkość 1 m/s
        this.available = capacity;
        this.waitQueue = []; // Kolejka oczekujących na zasób
        this.engine = engine; 
        
        // Zabezpieczenie przed brakiem silnika (dla testów)
        if (!this.engine || !this.engine.logMessage) {
            this.engine = { logMessage: (msg) => console.log(msg) };
        }
        
        this.engine.logMessage(`[Pula] '${name}' stworzona z pojemnością: ${capacity}, Prędkość: ${this.speed} m/s`);
    }

    // Żądanie zasobu. Zwraca true (sukces) lub false (dodano do kolejki).
    request(entity, count) {
        this.engine.logMessage(`> [${entity.id}] żąda ${count} z puli '${this.name}' (Dostępne: ${this.available})`);
        
        if (count > this.capacity) {
             this.engine.logMessage(`! BŁĄD: Żądanie ${count} przekracza całkowitą pojemność puli ${this.capacity}.`);
             return false;
        }
        
        if (this.available >= count) {
            this.available -= count;
            this.engine.logMessage(`  = SUKCES: Przyznano ${count} dla [${entity.id}]. Pozostało w '${this.name}': ${this.available}`);
            return true;
        } else {
            this.waitQueue.push({ entity, count });
            this.engine.logMessage(`  = KOLEJKA: [${entity.id}] dodany do kolejki '${this.name}'. Czeka na ${count}.`);
            return false;
        }
    }

    // Zwolnienie zasobu. Może automatycznie odblokować oczekującego z kolejki.
    release(entityReleasing, count) {
        this.available += count;
        this.engine.logMessage(`< [${entityReleasing.id}] zwalnia ${count} do puli '${this.name}'. Dostępne: ${this.available}`);

        if (this.waitQueue.length > 0) {
            const nextInQueue = this.waitQueue[0];
            
            if (this.available >= nextInQueue.count) {
                this.available -= nextInQueue.count;
                const unblocked = this.waitQueue.shift();
                
                this.engine.logMessage(`  = ODBLOKOWANO: [${unblocked.entity.id}] pobrał ${unblocked.count} z '${this.name}'. Pozostało: ${this.available}`);
                return unblocked.entity; // Zwraca encję, która została odblokowana
            } else {
                 this.engine.logMessage(`  = CZEKA: Dostępne ${this.available}, ale [${this.waitQueue[0].entity.id}] potrzebuje ${this.waitQueue[0].count}`);
            }
        }
        return null;
    }
}