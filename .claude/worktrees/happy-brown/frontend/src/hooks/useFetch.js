import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Simple hook that fetches data from a given endpoint.
 *
 * @param {string} endpoint - The API endpoint to fetch.
 */
const useFetch = (endpoint) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(endpoint)
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [endpoint]);

  return { data, loading, error };
};

export default useFetch;