
export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface DetectionResult {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  label: string;
}

export enum ItemStatus {
  PENDING = 'PENDING',
  DETECTING = 'DETECTING',
  BLURRING = 'BLURRING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface QueueItem {
  id: string;
  originalUrl: string;
  processedUrl: string | null;
  status: ItemStatus;
  error: string | null;
  fileName: string;
}

export interface ProcessedImage {
  id: string;
  originalUrl: string;
  processedUrl: string;
  timestamp: number;
}
