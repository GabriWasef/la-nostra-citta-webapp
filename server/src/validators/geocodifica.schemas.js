import { z } from 'zod';

export const ricerca = z.object({
  q: z.string().trim().min(3, 'Scrivi almeno 3 caratteri.').max(200),
});

export const inversa = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
