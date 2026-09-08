import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

import { StorageManager } from "./storage-manager";

const config = {
  id: "s1",
  name: "数据胶囊",
  providerId: "data_capsule",
  endpoint: "https://s3.cstcloud.cn",
  region: "us-east-1",
  bucket: "acs",
  accessKeyId: "AKID",
  publicBase: "",
  keyPrefix: "acs/",
  clientApp: "s3drive",
  enabled: true,
};

describe("StorageManager SecretAccessKey 眼睛查看", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // 列表加载
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/storage/config"
        ? Response.json([config])
        : Response.json({ error: "unexpected" }, { status: 500 }),
    );
  });

  it("编辑时点眼睛从后端取回已存 SecretAccessKey 并显示明文", async () => {
    render(<StorageManager />);
    await waitFor(() => expect(screen.getByText("数据胶囊")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    const input = screen.getByLabelText(/SecretAccessKey/) as HTMLInputElement;
    expect(input.type).toBe("password");

    fetchMock.mockImplementationOnce(async (url: string) =>
      url === "/api/storage/config/s1/reveal"
        ? Response.json({ id: "s1", secret: "sk-s3-plain" })
        : Response.json({ error: "unexpected" }, { status: 500 }),
    );
    fireEvent.click(screen.getByTestId("storage-reveal"));

    await waitFor(() => expect(input.value).toBe("sk-s3-plain"));
    await waitFor(() => expect(input.type).toBe("text"));
  });

  it("再点眼睛切回掩码（不重新请求）", async () => {
    render(<StorageManager />);
    await waitFor(() => expect(screen.getByText("数据胶囊")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));

    fetchMock.mockImplementationOnce(async (url: string) =>
      url === "/api/storage/config/s1/reveal"
        ? Response.json({ id: "s1", secret: "sk-s3-plain" })
        : Response.json({ error: "unexpected" }, { status: 500 }),
    );
    const eye = screen.getByTestId("storage-reveal");
    fireEvent.click(eye);
    const input = (await waitFor(() => {
      const el = screen.getByLabelText(/SecretAccessKey/) as HTMLInputElement;
      if (el.value !== "sk-s3-plain") throw new Error("not revealed yet");
      return el;
    })) as HTMLInputElement;

    const callsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/reveal")).length;
    fireEvent.click(eye);
    await waitFor(() => expect(input.type).toBe("password"));
    const callsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/reveal")).length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("reveal API 失败显示错误且不回填明文", async () => {
    render(<StorageManager />);
    await waitFor(() => expect(screen.getByText("数据胶囊")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));

    fetchMock.mockImplementationOnce(async (url: string) =>
      url === "/api/storage/config/s1/reveal"
        ? Response.json({ error: "未授权" }, { status: 401 })
        : Response.json({ error: "unexpected" }, { status: 500 }),
    );
    fireEvent.click(screen.getByTestId("storage-reveal"));

    await waitFor(() =>
      expect(screen.getByTestId("storage-reveal-error")).toHaveTextContent("未授权"),
    );
    const input = screen.getByLabelText(/SecretAccessKey/) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("新建配置（非编辑态）不显示眼睛按钮", async () => {
    render(<StorageManager />);
    await waitFor(() => expect(screen.getByText("数据胶囊")).toBeInTheDocument());
    expect(screen.queryByTestId("storage-reveal")).not.toBeInTheDocument();
  });
});
