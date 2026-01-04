// priority_queue.js
// Implementacja Kolejki Priorytetowej (Min-Heap)
// To jest znacznie wydajniejsze (O(log n)) niż Array.splice (O(n)) z V1
// dla zarządzania kolejką zdarzeń symulacji.

class PriorityQueue {
    constructor(comparator = (a, b) => a.time < b.time) {
        this.heap = [];
        this.comparator = comparator; // Porównuje elementy, np. zdarzenia po czasie
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.size() === 0;
    }

    // Zwraca szczyt (najbliższe zdarzenie) bez usuwania
    peek() {
        return this.heap[0] || null;
    }

    // Dodaje nowy element (zdarzenie)
    push(value) {
        this.heap.push(value);
        this.siftUp(this.heap.length - 1);
    }

    // Usuwa i zwraca szczyt (najbliższe zdarzenie)
    pop() {
        if (this.isEmpty()) return null;
        if (this.size() === 1) return this.heap.pop();

        const poppedValue = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.siftDown(0);
        return poppedValue;
    }

    // === Metody wewnętrzne (helpers) ===

    parent(i) {
        return Math.floor((i - 1) / 2);
    }
    leftChild(i) {
        return 2 * i + 1;
    }
    rightChild(i) {
        return 2 * i + 2;
    }
    swap(i, j) {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }

    siftUp(i) {
        while (i > 0 && this.comparator(this.heap[i], this.heap[this.parent(i)])) {
            this.swap(i, this.parent(i));
            i = this.parent(i);
        }
    }

    siftDown(i) {
        let maxIndex = i;
        const left = this.leftChild(i);
        const right = this.rightChild(i);

        if (left < this.size() && this.comparator(this.heap[left], this.heap[maxIndex])) {
            maxIndex = left;
        }
        if (right < this.size() && this.comparator(this.heap[right], this.heap[maxIndex])) {
            maxIndex = right;
        }

        if (i !== maxIndex) {
            this.swap(i, maxIndex);
            this.siftDown(maxIndex);
        }
    }
}