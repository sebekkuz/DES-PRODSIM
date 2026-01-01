// src/logic/priority_queue.js
// Implementacja Kolejki Priorytetowej (Min-Heap)

export default class PriorityQueue {
    constructor(comparator = (a, b) => a.time < b.time) {
        this.heap = [];
        this.comparator = comparator;
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.size() === 0;
    }

    peek() {
        return this.heap[0] || null;
    }

    push(value) {
        this.heap.push(value);
        this.siftUp(this.heap.length - 1);
    }

    pop() {
        if (this.isEmpty()) return null;
        if (this.size() === 1) return this.heap.pop();

        const poppedValue = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.siftDown(0);
        return poppedValue;
    }

    parent(i) { return Math.floor((i - 1) / 2); }
    leftChild(i) { return 2 * i + 1; }
    rightChild(i) { return 2 * i + 2; }
    swap(i, j) { [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]]; }

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