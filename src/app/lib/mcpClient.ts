// MCP Client for Make.com integration via API route
export class MCPClient {
  private async makeApiRequest(action: string, data: any) {
    const response = await fetch('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'MCP request failed');
    }

    return result.data;
  }

  // Reservation tool
  async createReservation(data: {
    name: string;
    date: string;
    time: string;
    guests_number: number;
    tel: string;
    location?: string;
    notes?: string;
    source_id: string;
  }) {
    return await this.makeApiRequest('createReservation', data);
  }

  // Order tool
  async createOrder(data: {
    name: string;
    date: string;
    delivery_time: string;
    delivery_type: string;
    delivery_address: string;
    tel: string;
    items: Array<{
      name: string;
      qty: number;
      price?: number;
      notes?: string;
    }>;
    total: number;
    notes?: string;
    source_id: string;
  }) {
    return await this.makeApiRequest('createOrder', data);
  }
}

// Singleton instance
export const mcpClient = new MCPClient();
