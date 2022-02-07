class MyJob 
    include Sidekiq::Worker 
        
    def perform 
        ExportXls.new.call
    end 
  end