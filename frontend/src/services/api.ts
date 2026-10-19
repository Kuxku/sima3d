import axios from 'axios';

export const apiClient = axios.create({
    baseURL: 'http://localhost:8000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const GraphService = {
    getGraph: async () => {
        const response = await apiClient.get('/graph');
        return response.data;
    }
};

export const CopilotService = {
    chat: async (message: string, selectedNodeId: string | null = null) => {
        const response = await apiClient.post('/copilot/chat', {
            message,
            history: [],
            selected_node_id: selectedNodeId
        });
        return response.data;
    }
};