/**
 * Redis adapter hook placeholder.
 * This keeps the socket bootstrap structured for future horizontal scaling
 * without requiring Redis or adapter dependencies today.
 */
export async function configureSocketAdapter(io) {
  return io;
}
