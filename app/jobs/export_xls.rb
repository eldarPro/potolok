class ExportXls 

    include Sidekiq::Worker 
        
    def perform cat_temp, list_barcodes, list_emails
        ExportXls.new(cat_temp, list_barcodes, list_emails).call
    end 
  end