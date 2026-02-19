require "test_helper"

class LeadDossierPdfTest < ActiveSupport::TestCase
  test "renders a pdf document" do
    lead = leads(:one)

    pdf_data = LeadDossierPdf.new(lead).render

    assert pdf_data.present?
    assert pdf_data.start_with?("%PDF")
  end
end
