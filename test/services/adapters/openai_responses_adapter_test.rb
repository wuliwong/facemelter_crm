require "test_helper"

class OpenaiResponsesAdapterTest < ActiveSupport::TestCase
  test "builds valid endpoint uri for responses path" do
    adapter = Adapters::OpenaiResponsesAdapter.new(base_url: "https://api.openai.com/v1")

    uri = adapter.send(:endpoint_uri, "responses")

    assert_equal "https", uri.scheme
    assert_equal "api.openai.com", uri.host
    assert_equal "/v1/responses", uri.path
  end

  test "normalizes leading path slash and trailing base slash" do
    adapter = Adapters::OpenaiResponsesAdapter.new(base_url: "https://api.openai.com/v1/")

    uri = adapter.send(:endpoint_uri, "/responses")

    assert_equal "api.openai.com", uri.host
    assert_equal "/v1/responses", uri.path
  end

  test "raises clear error when endpoint has no host" do
    adapter = Adapters::OpenaiResponsesAdapter.new(base_url: "/")

    error = assert_raises(RuntimeError) do
      adapter.send(:endpoint_uri, "responses")
    end

    assert_includes error.message, "invalid endpoint URL"
  end
end
