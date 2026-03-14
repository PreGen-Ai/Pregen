import  { useState, useEffect, useContext } from "react";
import { useLocation } from "react-router-dom";
import  DashboardContext  from "../../context/DashboardContext";
import { Spinner, Table, Container } from "react-bootstrap";

const SearchResults = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const { searchPublicWorkspaces, searchDocuments } =
    useContext(DashboardContext);

  // Custom hook to get query params
  const useQuery = () => {
    return new URLSearchParams(useLocation().search);
  };

  const query = useQuery();
  const searchTerm = query.get("term");

  useEffect(() => {
    const fetchSearchResults = async () => {
      setLoading(true);
      try {
        // Fetch public workspaces or documents based on search term
        const workspaces = await searchPublicWorkspaces(searchTerm);
        const documents = await searchDocuments(searchTerm);
        setResults([...workspaces, ...documents]); // Combine results from both
      } catch (error) {
        console.error("Error fetching search results:", error);
      } finally {
        setLoading(false);
      }
    };

    if (searchTerm) {
      fetchSearchResults();
    }
  }, [searchTerm, searchPublicWorkspaces, searchDocuments]);

  if (loading) {
    return (
      <div className="centered-spinner">
        <Spinner animation="border" role="status">
          <span className="sr-only">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <Container>
      <h1>Search Results for "{searchTerm}"</h1>
      {results.length > 0 ? (
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={index}>
                <td>{result.name}</td>
                <td>
                  {result.description || result.metadata || "No description"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p>No results found.</p>
      )}
    </Container>
  );
};

export default SearchResults;
