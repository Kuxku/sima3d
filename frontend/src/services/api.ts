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
    },
    voiceQuery: async (message: string, selectedNodeId: string | null = null) => {
        const response = await apiClient.post('/copilot/voice/query', {
            message,
            selected_node_id: selectedNodeId
        });
        return response.data;
    },
    getActions: async () => {
        const response = await apiClient.get('/copilot/actions');
        return response.data;
    },
    getLiveWebSocketUrl: (selectedNodeId?: string | null) => {
        const baseUrl = apiClient.defaults.baseURL || 'http://localhost:8000/api';
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Parse host from baseURL or fallback
        const parsedUrl = new URL(baseUrl, window.location.href);
        const wsHost = parsedUrl.host;
        let wsUrl = `${wsProtocol}//${wsHost}/api/copilot/ws/live`;
        if (selectedNodeId) {
            wsUrl += `?selected_node_id=${encodeURIComponent(selectedNodeId)}`;
        }
        return wsUrl;
    }
};